import "server-only";
import { after } from "next/server";
import {
  ElevateError,
  isTerminal,
  parseResumeWithAI,
  runAnalysisPipeline,
  runCandidatePipeline,
  type AnalysisEventType,
  type AnalysisStatus,
  type AnalysisStore,
  type JobIntelligence,
  type NormalizedJob,
  type ResearchBundle,
  type StageName,
  type Stages,
} from "@elevate/core/server";
import type { Db } from "../supabase";
import { createTokenClient } from "../supabase";
import { log } from "../log";
import { captureException } from "../monitoring";
import { ai, research } from "../providers";
import { rowToClaim, rowToJob, rowToSource, type AnalysisRow, type EvidenceRow, type JobRow, type SourceRow } from "./rows";
import { getPrimaryResumeVersion } from "./resumes";
import { notify, trackEvent } from "./events";

const MAX_ANALYSES_PER_HOUR = 40;

/** Supabase implementation of the pipeline's persistence port. Runs under the user's JWT (RLS). */
class SupabaseAnalysisStore implements AnalysisStore {
  constructor(
    private readonly db: Db,
    private readonly userId: string,
    private readonly jobId: string,
    private readonly analysisId: string,
  ) {}

  private async must<T>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>, what: string): Promise<NonNullable<T>> {
    const { data, error } = await p;
    if (error) throw new ElevateError("internal", `Couldn't save ${what}.`, { details: { code: error.code } });
    return (data ?? ([] as unknown)) as NonNullable<T>;
  }

  async setStatus(status: AnalysisStatus, patch: { stages: Stages; error?: { code: string; message: string } | null }) {
    await this.must(
      this.db
        .from("job_analyses")
        .update({
          status,
          stages: patch.stages,
          ...(patch.error !== undefined ? { error: patch.error } : {}),
          ...(isTerminal(status) ? { completed_at: new Date().toISOString() } : {}),
        })
        .eq("id", this.analysisId),
      "analysis status",
    );
  }

  async emit(type: AnalysisEventType, stage: StageName | null, payload: Record<string, unknown> = {}) {
    await this.must(
      this.db.from("analysis_events").insert({ analysis_id: this.analysisId, user_id: this.userId, type, stage, payload }),
      "analysis event",
    );
  }

  async saveIntelligence(data: { intel: JobIntelligence; classification: AnalysisRow["classification"]; provider: string | null }) {
    await this.must(
      this.db
        .from("job_analyses")
        .update({ intelligence: data.intel, classification: data.classification, provider: data.provider })
        .eq("id", this.analysisId),
      "job intelligence",
    );
  }

  async applyProposedJobFields(fields: { title: string | null; company: string | null; location: string | null }): Promise<NormalizedJob> {
    const current = await this.must(this.db.from("jobs").select("*").eq("id", this.jobId).single<JobRow>(), "job");
    const patch: Record<string, string> = {};
    const sources = { ...((current.extraction as { fieldSources?: Record<string, string> }).fieldSources ?? {}) };
    // Only fill fields the extractor could not find; never overwrite structured data.
    for (const k of ["title", "company", "location"] as const) {
      if (!current[k] && fields[k]) {
        patch[k] = fields[k]!;
        sources[k] = "ai";
      }
    }
    if (Object.keys(patch).length === 0) return rowToJob(current);
    const updated = await this.must(
      this.db
        .from("jobs")
        .update({ ...patch, extraction: { ...current.extraction, fieldSources: sources } })
        .eq("id", this.jobId)
        .select("*")
        .single<JobRow>(),
      "job fields",
    );
    return rowToJob(updated);
  }

  async getResearch(): Promise<ResearchBundle | null> {
    const { data: meta } = await this.db.from("job_research").select("*").eq("job_id", this.jobId).maybeSingle();
    if (!meta || meta.status !== "completed") return null;
    const [sources, claims] = await Promise.all([
      this.must(this.db.from("research_sources").select("*").eq("job_id", this.jobId).returns<SourceRow[]>(), "sources"),
      this.must(this.db.from("interview_evidence").select("*").eq("job_id", this.jobId).returns<EvidenceRow[]>(), "evidence"),
    ]);
    return { sources: sources.map(rowToSource), claims: claims.map(rowToClaim), retrievedAt: meta.retrieved_at, provider: meta.provider };
  }

  async saveResearch(data: ResearchBundle & { status: "completed" | "failed" | "unavailable"; error: string | null }): Promise<ResearchBundle> {
    // Replace this job's research atomically enough for our purposes: delete then insert.
    await this.must(this.db.from("interview_evidence").delete().eq("job_id", this.jobId), "old evidence");
    await this.must(this.db.from("research_sources").delete().eq("job_id", this.jobId), "old sources");
    if (data.sources.length) {
      await this.must(
        this.db.from("research_sources").insert(
          data.sources.map((s) => ({
            id: s.id,
            user_id: this.userId,
            job_id: this.jobId,
            provider: s.provider,
            query: s.query,
            url: s.url,
            domain: s.domain,
            title: s.title,
            snippet: s.snippet,
            kind: s.kind,
            scope: s.scope ?? "company",
            published_at: s.publishedAt,
            retrieved_at: s.retrievedAt,
          })),
        ),
        "sources",
      );
    }
    if (data.claims.length) {
      await this.must(
        this.db.from("interview_evidence").insert(
          data.claims.map((c) => ({
            id: c.id,
            user_id: this.userId,
            job_id: this.jobId,
            kind: c.kind,
            text: c.text,
            ord: c.order,
            category: c.category,
            scope: c.scope,
            evidence_type: c.evidence.type,
            quote: c.evidence.quote,
            source_ids: c.evidence.sourceIds,
          })),
        ),
        "evidence",
      );
    }
    await this.must(
      this.db.from("job_research").upsert({
        job_id: this.jobId,
        user_id: this.userId,
        status: data.status,
        provider: data.provider,
        note: data.error,
        retrieved_at: data.retrievedAt,
      }),
      "research status",
    );
    return data;
  }

  async saveQuestions(data: { questions: AnalysisRow["questions"]; predictedProcess: AnalysisRow["predicted_process"] }) {
    await this.must(
      this.db.from("job_analyses").update({ questions: data.questions, predicted_process: data.predictedProcess }).eq("id", this.analysisId),
      "questions",
    );
  }

  async saveCandidate(data: Parameters<AnalysisStore["saveCandidate"]>[0]) {
    const ca = await this.must(
      this.db
        .from("candidate_analyses")
        .insert({
          user_id: this.userId,
          job_id: this.jobId,
          job_analysis_id: this.analysisId,
          resume_version_id: data.resumeVersionId,
          matches: data.matches,
          provider: data.provider,
        })
        .select("id")
        .single<{ id: string }>(),
      "candidate analysis",
    );
    const common = { user_id: this.userId, candidate_analysis_id: ca.id, job_id: this.jobId, resume_version_id: data.resumeVersionId };
    await Promise.all([
      this.must(this.db.from("ats_analyses").insert({ ...common, score: data.ats.score, result: data.ats }), "ATS estimate"),
      this.must(this.db.from("fit_analyses").insert({ ...common, score: data.fit.score, result: data.fit }), "fit"),
    ]);
  }
}

export async function getJobRow(db: Db, jobId: string): Promise<JobRow> {
  const { data, error } = await db.from("jobs").select("*").eq("id", jobId).maybeSingle<JobRow>();
  if (error) throw new ElevateError("internal", "Couldn't load the job.");
  if (!data) throw new ElevateError("not_found", "This job doesn't exist or isn't yours.");
  return data;
}

export async function latestAnalysis(db: Db, jobId: string): Promise<AnalysisRow | null> {
  const { data } = await db
    .from("job_analyses")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AnalysisRow>();
  return data ?? null;
}

async function enforceRateLimit(db: Db) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db.from("job_analyses").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= MAX_ANALYSES_PER_HOUR) {
    throw new ElevateError("rate_limited", "You've run a lot of analyses in the last hour. Try again a little later.");
  }
}

export type AnalysisMode = "full" | "research" | "candidate";

/**
 * Create an analysis row and run the pipeline after the response is sent.
 * Background work runs under the user's own JWT so RLS still applies.
 */
export async function startAnalysis(
  ctx: { db: Db; userId: string; accessToken: string; requestId: string },
  jobId: string,
  mode: AnalysisMode,
  opts: { resumeVersionId?: string | null } = {},
): Promise<{ analysisId: string; reused: boolean }> {
  await ctx.db.rpc("close_stale_analyses");
  const job = await getJobRow(ctx.db, jobId);
  const previous = await latestAnalysis(ctx.db, jobId);
  if (previous && !isTerminal(previous.status)) return { analysisId: previous.id, reused: true };
  await enforceRateLimit(ctx.db);

  if ((mode === "research" || mode === "candidate") && !previous?.intelligence) {
    mode = "full";
  }

  const resume = opts.resumeVersionId
    ? await getResumeVersionForAnalysis(ctx.db, opts.resumeVersionId)
    : await getPrimaryResumeVersion(ctx.db);
  if (mode === "candidate" && !resume) throw new ElevateError("invalid_input", "Add your resume to compare it with this job.");

  const { data: created, error } = await ctx.db
    .from("job_analyses")
    .insert({
      user_id: ctx.userId,
      job_id: jobId,
      resume_version_id: resume?.id ?? null,
      status: "CAPTURED",
      ...(mode !== "full" && previous
        ? {
            intelligence: previous.intelligence,
            classification: previous.classification,
            questions: previous.questions,
            predicted_process: previous.predicted_process,
            provider: previous.provider,
          }
        : {}),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) throw new ElevateError("internal", "Couldn't start the analysis.");
  const analysisId = created.id;

  const token = ctx.accessToken;
  const userId = ctx.userId;
  const requestId = ctx.requestId;
  after(async () => {
    const db = createTokenClient(token);
    const store = new SupabaseAnalysisStore(db, userId, jobId, analysisId);
    const deps = {
      ai: ai(),
      research: research(),
      store,
      newId: () => crypto.randomUUID(),
      log: (event: string, fields: Record<string, unknown>) => log.info(event, { requestId, jobId, analysisId, ...fields }),
    };
    const started = Date.now();
    try {
      // A resume stored before an AI provider existed is parsed now, once, so experience and
      // education can be compared. Only the parse fields change; the source text is immutable.
      if (resume && resume.parse_status !== "parsed" && deps.ai) {
        try {
          const out = await parseResumeWithAI(deps.ai, resume.raw_text);
          const { error } = await db
            .from("resume_versions")
            .update({ parsed: out.parsed, parse_status: "parsed", parse_warnings: out.warnings, parse_provider: `${out.provider}:${out.model}` })
            .eq("id", resume.id);
          if (error) log.warn("resume.reparse_save_failed", { requestId, analysisId, code: error.code });
          resume.parsed = out.parsed;
          resume.parse_status = "parsed";
          log.info("resume.reparsed", { requestId, analysisId, experienceEntries: out.parsed.experience.length });
        } catch (err) {
          log.warn("resume.reparse_failed", { requestId, analysisId, code: err instanceof ElevateError ? err.code : "unknown" });
        }
      }
      let status: AnalysisStatus;
      if (mode === "candidate" && previous?.intelligence && resume) {
        status = await runCandidatePipeline(deps, {
          job: rowToJob(job),
          intel: previous.intelligence,
          resume: { versionId: resume.id, text: resume.raw_text, parsed: resume.parsed },
          previousStages: previous.stages,
        });
      } else {
        status = await runAnalysisPipeline(deps, {
          job: rowToJob(job),
          resume: resume ? { versionId: resume.id, text: resume.raw_text, parsed: resume.parsed } : null,
          forceResearch: mode === "research",
          reuse: mode === "research" && previous?.intelligence ? { intel: previous.intelligence, classification: previous.classification, stages: previous.stages } : null,
        });
      }
      log.info("analysis.finished", { requestId, jobId, analysisId, status, durationMs: Date.now() - started, mode });
      await notify(db, userId, {
        kind: status === "FAILED" || status === "TIMEOUT" ? "analysis_failed" : "analysis_completed",
        title: status === "FAILED" || status === "TIMEOUT" ? "Analysis didn't finish" : "Analysis ready",
        body: [job.title, job.company].filter(Boolean).join(" · ") || null,
        link: `/jobs/${jobId}`,
      });
      if (mode === "full") await trackEvent(db, userId, "job_analyzed", { platform: job.source_platform, status });
    } catch (err) {
      log.error("analysis.crashed", { requestId, jobId, analysisId });
      captureException(err, { requestId, jobId, analysisId });
      await db
        .from("job_analyses")
        .update({ status: "FAILED", error: { code: "internal", message: "The analysis stopped unexpectedly." }, completed_at: new Date().toISOString() })
        .eq("id", analysisId);
    }
  });
  return { analysisId, reused: false };
}

async function getResumeVersionForAnalysis(db: Db, id: string) {
  const { data } = await db.from("resume_versions").select("*").eq("id", id).maybeSingle();
  if (!data) throw new ElevateError("not_found", "That resume version doesn't exist.");
  return data as import("./rows").ResumeVersionRow;
}

export const ANALYSIS_STAGES: StageName[] = ["extraction", "classification", "requirements", "research", "candidate", "ats", "fit"];
