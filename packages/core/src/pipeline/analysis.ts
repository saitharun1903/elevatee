import type { AIProvider } from "../ai/provider";
import { AI_UNAVAILABLE_REASON } from "../ai/providers";
import { compareCandidate } from "../analysis/candidate";
import { analyzeJobWithAI, deterministicClassification, deterministicIntelligence } from "../analysis/intelligence";
import { predictQuestions, questionsFromClaims } from "../analysis/questions";
import { computeAts, computeFit } from "../analysis/scoring";
import { buildQueries, gatherSources, RESEARCH_STALE_MS, synthesizeClaims, type QueryScope } from "../research/engine";
import { RESEARCH_UNAVAILABLE_REASON, type ResearchProvider } from "../research/providers";
import type {
  AnalysisEventType,
  AnalysisStatus,
  AtsResult,
  FitResult,
  InterviewQuestion,
  JobIntelligence,
  NormalizedJob,
  ParsedResume,
  RequirementMatch,
  ResearchClaim,
  ResearchSource,
  RoleClassification,
  StageName,
  StageState,
} from "../schemas";
import { ElevateError, isElevateError } from "../util/errors";
import { TIMEOUTS } from "../util/timeout";

export type Stages = Partial<Record<StageName, StageState>>;

export interface ResearchBundle {
  sources: (ResearchSource & { scope?: QueryScope })[];
  claims: ResearchClaim[];
  retrievedAt: string;
  provider: string | null;
}

export interface CandidateBundle {
  resumeVersionId: string;
  matches: RequirementMatch[] | null;
  ats: AtsResult;
  fit: FitResult;
  provider: string | null;
}

/** Persistence port. The web app implements it with Supabase (RLS-scoped); tests use memory. */
export interface AnalysisStore {
  setStatus(status: AnalysisStatus, patch: { stages: Stages; error?: { code: string; message: string } | null }): Promise<void>;
  emit(type: AnalysisEventType, stage: StageName | null, payload?: Record<string, unknown>): Promise<void>;
  saveIntelligence(data: { intel: JobIntelligence; classification: RoleClassification | null; provider: string | null }): Promise<void>;
  applyProposedJobFields(fields: { title: string | null; company: string | null; location: string | null }): Promise<NormalizedJob>;
  getResearch(): Promise<ResearchBundle | null>;
  saveResearch(data: ResearchBundle & { status: "completed" | "failed" | "unavailable"; error: string | null }): Promise<ResearchBundle>;
  saveQuestions(data: { questions: InterviewQuestion[]; predictedProcess: { step: string; description: string }[] }): Promise<void>;
  saveCandidate(data: CandidateBundle): Promise<void>;
}

export interface PipelineDeps {
  ai: AIProvider | null;
  research: ResearchProvider | null;
  store: AnalysisStore;
  newId: () => string;
  log?: (event: string, fields: Record<string, unknown>) => void;
  /** Override for tests. */
  totalTimeoutMs?: number;
}

export interface PipelineInput {
  job: NormalizedJob;
  resume: { versionId: string; text: string; parsed: ParsedResume | null } | null;
  forceResearch?: boolean;
  /** Reuse a previous intelligence result (research refresh) instead of re-running the AI step. */
  reuse?: { intel: JobIntelligence; classification: RoleClassification | null; stages: Stages } | null;
}

const now = () => new Date().toISOString();

class StageTracker {
  stages: Stages = {};
  constructor(private readonly deps: PipelineDeps) {}
  start(name: StageName, provider: string | null = null) {
    this.stages[name] = { outcome: "running", reason: null, startedAt: now(), finishedAt: null, provider };
  }
  finish(name: StageName, outcome: StageState["outcome"], reason: string | null = null, provider?: string | null) {
    const prev = this.stages[name];
    this.stages[name] = {
      outcome,
      reason,
      startedAt: prev?.startedAt ?? now(),
      finishedAt: now(),
      provider: provider ?? prev?.provider ?? null,
    };
    if (outcome === "failed" || outcome === "timeout") this.deps.log?.("analysis.stage_failed", { stage: name, outcome, reason });
  }
}

function reasonOf(err: unknown): { outcome: "failed" | "timeout"; reason: string } {
  if (isElevateError(err)) return { outcome: err.code === "timeout" ? "timeout" : "failed", reason: err.userMessage };
  return { outcome: "failed", reason: "Unexpected error in this step." };
}

/**
 * Runs the whole job analysis. Every stage is independent where possible: a failed stage is
 * recorded and the pipeline continues with what it has, ending in PARTIAL instead of FAILED.
 * A hard deadline guarantees the analysis always ends in a terminal state.
 */
export async function runAnalysisPipeline(deps: PipelineDeps, input: PipelineInput): Promise<AnalysisStatus> {
  const { store } = deps;
  const t = new StageTracker(deps);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new ElevateError("timeout", "The analysis took too long.")), deps.totalTimeoutMs ?? TIMEOUTS.analysisTotal);
  const signal = controller.signal;
  const set = (status: AnalysisStatus, error: { code: string; message: string } | null = null) => store.setStatus(status, { stages: t.stages, error });

  try {
    await store.emit("analysis_started", null, { hasResume: !!input.resume });
    let job = input.job;
    t.finish("extraction", "completed");
    await store.emit("job_extracted", "extraction", { title: job.title, company: job.company, location: job.location });

    // ---- Classification + requirements -------------------------------------------------
    await set("CLASSIFYING");
    let intel: JobIntelligence = deterministicIntelligence(job);
    let classification: RoleClassification | null = deterministicClassification(job);
    let intelProvider: string | null = null;
    if (input.reuse) {
      intel = input.reuse.intel;
      classification = input.reuse.classification;
      for (const s of ["classification", "requirements"] as const) {
        const prev = input.reuse.stages[s];
        if (prev) t.stages[s] = prev;
        else t.finish(s, "completed", "Reused from the previous analysis.");
      }
    } else if (deps.ai) {
      t.start("classification", deps.ai.id);
      t.start("requirements", deps.ai.id);
      try {
        const out = await analyzeJobWithAI(deps.ai, job, signal);
        intel = out.intelligence;
        classification = out.classification;
        intelProvider = `${out.provider}:${out.model}`;
        if (out.proposed.title || out.proposed.company || out.proposed.location) {
          job = await store.applyProposedJobFields(out.proposed);
        }
        t.finish("classification", "completed");
        t.finish("requirements", "completed");
      } catch (err) {
        if (signal.aborted) throw err;
        const r = reasonOf(err);
        t.finish("classification", r.outcome, `${r.reason} Showing what could be read directly from the posting.`);
        t.finish("requirements", r.outcome, r.reason);
      }
    } else {
      t.finish("classification", classification ? "completed" : "unavailable", AI_UNAVAILABLE_REASON);
      t.finish("requirements", "unavailable", AI_UNAVAILABLE_REASON);
    }
    await store.saveIntelligence({ intel, classification, provider: intelProvider });
    await store.emit("classification_completed", "classification", { classification });
    await store.emit("requirements_extracted", "requirements", { requirements: intel.requirements.length, skills: intel.skills.length });

    // ---- Research ---------------------------------------------------------------------
    await set("RESEARCHING");
    let research: ResearchBundle | null = null;
    const cached = input.forceResearch ? null : await store.getResearch();
    if (cached && Date.now() - new Date(cached.retrievedAt).getTime() < RESEARCH_STALE_MS) {
      research = cached;
      t.finish("research", "completed", "Using research retrieved earlier for this job.", cached.provider);
    } else if (!deps.research) {
      t.finish("research", "unavailable", RESEARCH_UNAVAILABLE_REASON);
      await store.emit("stage_unavailable", "research", { reason: RESEARCH_UNAVAILABLE_REASON });
    } else {
      t.start("research", deps.research.id);
      await store.emit("research_started", "research", { provider: deps.research.id });
      try {
        const queries = buildQueries(job, classification);
        if (queries.length === 0) {
          t.finish("research", "skipped", "The posting has no company or title to research.");
        } else {
          const gathered = await gatherSources(deps.research, job, queries, { signal, newId: deps.newId });
          let claims: ResearchClaim[] = [];
          let note: string | null = gathered.failedQueries.length ? `${gathered.failedQueries.length} of ${queries.length} searches failed.` : null;
          if (deps.ai && gathered.sources.length) {
            try {
              claims = (await synthesizeClaims(deps.ai, job, gathered.sources, { signal, newId: deps.newId })).claims;
            } catch (err) {
              if (signal.aborted) throw err;
              note = `Sources were found but could not be summarised: ${reasonOf(err).reason}`;
            }
          } else if (!deps.ai) {
            note = "Sources are listed without a summary because no AI provider is configured.";
          }
          research = await store.saveResearch({
            sources: gathered.sources,
            claims,
            retrievedAt: now(),
            provider: deps.research.id,
            status: gathered.failedQueries.length === queries.length ? "failed" : "completed",
            error: note,
          });
          const allFailed = gathered.failedQueries.length === queries.length;
          t.finish("research", allFailed ? "failed" : "completed", allFailed ? "All research searches failed." : note);
        }
      } catch (err) {
        if (signal.aborted) throw err;
        const r = reasonOf(err);
        t.finish("research", r.outcome, r.reason);
      }
    }

    // Questions: reported/similar from research; predicted from the job (clearly labelled).
    const claims = research?.claims ?? [];
    let questions = questionsFromClaims(claims);
    let predictedProcess: { step: string; description: string }[] = [];
    if (deps.ai && intel.requirements.length) {
      try {
        const p = await predictQuestions(deps.ai, job, intel, classification, claims.filter((c) => c.kind === "process_step"), { signal, newId: deps.newId });
        questions = [...questions, ...p.predicted];
        predictedProcess = p.predictedProcess;
      } catch (err) {
        if (signal.aborted) throw err;
        deps.log?.("analysis.prediction_failed", { reason: reasonOf(err).reason });
      }
    }
    await store.saveQuestions({ questions, predictedProcess });
    await store.emit("research_completed", "research", {
      sources: research?.sources.length ?? 0,
      claims: claims.length,
      questions: questions.length,
    });

    // ---- Candidate ----------------------------------------------------------------------
    if (input.resume) {
      await runCandidateStages(deps, t, { job, intel, resume: input.resume, signal, set });
    } else {
      for (const s of ["candidate", "ats", "fit"] as const) t.finish(s, "skipped", "Add your resume to see your match.");
    }

    await set("FINALIZING");
    const degraded = Object.values(t.stages).some((s) => s && ["failed", "timeout", "unavailable"].includes(s.outcome));
    const status: AnalysisStatus = degraded ? "PARTIAL" : "COMPLETED";
    await set(status);
    await store.emit("analysis_completed", null, { status });
    return status;
  } catch (err) {
    const timedOut = signal.aborted;
    for (const [name, s] of Object.entries(t.stages)) {
      if (s?.outcome === "running") t.finish(name as StageName, timedOut ? "timeout" : "failed", timedOut ? "Stopped: the analysis reached its time limit." : null);
    }
    const status: AnalysisStatus = timedOut ? "TIMEOUT" : "FAILED";
    const message = timedOut ? "The analysis took too long and was stopped. Results gathered so far are kept." : reasonOf(err).reason;
    deps.log?.("analysis.terminated", { status, reason: message });
    try {
      await store.setStatus(status, { stages: t.stages, error: { code: timedOut ? "timeout" : "internal", message } });
      await store.emit(timedOut ? "analysis_timeout" : "analysis_failed", null, { message });
    } catch {
      /* the caller's stale-analysis sweeper will close it */
    }
    return status;
  } finally {
    clearTimeout(deadline);
  }
}

async function runCandidateStages(
  deps: PipelineDeps,
  t: StageTracker,
  ctx: {
    job: NormalizedJob;
    intel: JobIntelligence;
    resume: NonNullable<PipelineInput["resume"]>;
    signal: AbortSignal;
    set: (s: AnalysisStatus) => Promise<void>;
  },
) {
  await ctx.set("CANDIDATE_ANALYSIS");
  let matches: RequirementMatch[] | null = null;
  let provider: string | null = null;
  if (!deps.ai) {
    t.finish("candidate", "unavailable", AI_UNAVAILABLE_REASON);
  } else if (ctx.intel.requirements.length === 0) {
    t.finish("candidate", "skipped", "No requirements were identified in the posting to compare against.");
  } else {
    t.start("candidate", deps.ai.id);
    try {
      const out = await compareCandidate(deps.ai, ctx.job, ctx.intel, ctx.resume.text, ctx.signal);
      matches = out.matches;
      provider = `${out.provider}:${out.model}`;
      t.finish("candidate", "completed");
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      const r = reasonOf(err);
      t.finish("candidate", r.outcome, r.reason);
    }
  }
  await deps.store.emit("resume_analyzed", "candidate", { compared: matches?.length ?? 0 });

  await ctx.set("ATS");
  const scoringInput = { job: ctx.job, intel: ctx.intel, resumeText: ctx.resume.text, parsed: ctx.resume.parsed, matches };
  const ats = computeAts(scoringInput);
  t.finish("ats", ats.score === null ? "unavailable" : "completed", ats.score === null ? "Not enough comparable data in the job and resume to estimate ATS compatibility." : null);
  await deps.store.emit("ats_completed", "ats", { score: ats.score });

  await ctx.set("FIT");
  const fit = computeFit(scoringInput);
  t.finish("fit", fit.score === null ? "unavailable" : "completed", fit.score === null ? (matches ? "Not enough requirements to calculate fit." : "Fit needs the requirement-by-requirement comparison.") : null);
  await deps.store.saveCandidate({ resumeVersionId: ctx.resume.versionId, matches, ats, fit, provider });
  await deps.store.emit("fit_completed", "fit", { score: fit.score });
}

/** Candidate-only run (resume added or replaced after the job was analysed). */
export async function runCandidatePipeline(
  deps: PipelineDeps,
  input: { job: NormalizedJob; intel: JobIntelligence; resume: NonNullable<PipelineInput["resume"]>; previousStages: Stages },
): Promise<AnalysisStatus> {
  const t = new StageTracker(deps);
  t.stages = { ...input.previousStages };
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), deps.totalTimeoutMs ?? TIMEOUTS.analysisTotal);
  const set = (status: AnalysisStatus) => deps.store.setStatus(status, { stages: t.stages });
  try {
    await runCandidateStages(deps, t, { ...input, signal: controller.signal, set });
    const degraded = Object.values(t.stages).some((s) => s && ["failed", "timeout", "unavailable"].includes(s.outcome));
    const status: AnalysisStatus = degraded ? "PARTIAL" : "COMPLETED";
    await deps.store.setStatus(status, { stages: t.stages });
    await deps.store.emit("analysis_completed", null, { status });
    return status;
  } catch (err) {
    const timedOut = controller.signal.aborted;
    for (const [name, s] of Object.entries(t.stages)) if (s?.outcome === "running") t.finish(name as StageName, timedOut ? "timeout" : "failed", null);
    const status: AnalysisStatus = timedOut ? "TIMEOUT" : "FAILED";
    await deps.store.setStatus(status, { stages: t.stages, error: { code: status.toLowerCase(), message: reasonOf(err).reason } }).catch(() => {});
    await deps.store.emit(timedOut ? "analysis_timeout" : "analysis_failed", null, {}).catch(() => {});
    return status;
  } finally {
    clearTimeout(deadline);
  }
}
