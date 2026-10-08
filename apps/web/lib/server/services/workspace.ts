import "server-only";
import type { NormalizedJob, ResearchClaim, ResearchSource } from "@elevate/core/server";
import type { Db } from "../supabase";
import { capabilities } from "../providers";
import { getJobRow, latestAnalysis } from "./analysis";
import { getPrimaryResumeVersion } from "./resumes";
import { rowToClaim, rowToJob, rowToSource, type AnalysisRow, type CandidateRow, type EvidenceRow, type SourceRow } from "./rows";

/**
 * The complete server view of one job, rendered by both the web workspace and the extension.
 * There is no client-side scoring or classification: everything here comes from the database.
 */
export interface JobWorkspace {
  id: string;
  job: NormalizedJob;
  extraction: JobRowExtraction;
  capturedVia: "extension" | "url" | "text";
  retrievedAt: string;
  createdAt: string;
  archived: boolean;
  saved: boolean;
  analysis: Omit<AnalysisRow, "user_id"> | null;
  research: {
    status: "completed" | "failed" | "unavailable";
    provider: string | null;
    note: string | null;
    retrievedAt: string;
    sources: (ResearchSource & { scope: "company" | "role" })[];
    claims: ResearchClaim[];
  } | null;
  candidate: {
    id: string;
    resumeVersionId: string;
    resumeLabel: string | null;
    resumeVersion: number | null;
    createdAt: string;
    matches: CandidateRow["matches"];
    ats: CandidateRow["ats_analyses"][number]["result"] | null;
    fit: CandidateRow["fit_analyses"][number]["result"] | null;
  } | null;
  primaryResume: { versionId: string; label: string | null; version: number } | null;
  application: {
    id: string;
    status: string;
    appliedAt: string | null;
    notes: string | null;
    updatedAt: string;
    events: { from_status: string | null; to_status: string; created_at: string }[];
    interviews: { id: string; scheduled_at: string; timezone: string; round: string; notes: string | null }[];
  } | null;
  plans: { id: string; title: string; durationDays: number; personalized: boolean; createdAt: string; total: number; done: number }[];
  mockInterviews: { id: string; mode: string; status: string; createdAt: string }[];
  capabilities: ReturnType<typeof capabilities>;
}

type JobRowExtraction = { fieldSources?: Record<string, string>; warnings?: string[]; completeness?: number; methodsTried?: string[] };

export async function getJobWorkspace(db: Db, jobId: string): Promise<JobWorkspace> {
  await db.rpc("close_stale_analyses");
  const row = await getJobRow(db, jobId);
  const [analysis, researchMeta, sources, claims, candidate, saved, application, plans, mocks, primary] = await Promise.all([
    latestAnalysis(db, jobId),
    db.from("job_research").select("*").eq("job_id", jobId).maybeSingle(),
    db.from("research_sources").select("*").eq("job_id", jobId).returns<SourceRow[]>(),
    db.from("interview_evidence").select("*").eq("job_id", jobId).order("ord", { ascending: true, nullsFirst: false }).returns<EvidenceRow[]>(),
    db
      .from("candidate_analyses")
      .select("id, job_id, job_analysis_id, resume_version_id, matches, provider, created_at, ats_analyses(score, result), fit_analyses(score, result), resume_versions(version, resumes(label))")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("saved_jobs").select("job_id").eq("job_id", jobId).maybeSingle(),
    db
      .from("applications")
      .select("id, status, applied_at, notes, updated_at, application_events(from_status, to_status, created_at), interview_sessions(id, scheduled_at, timezone, round, notes)")
      .eq("job_id", jobId)
      .maybeSingle(),
    db.from("preparation_plans").select("id, title, duration_days, personalized, created_at, preparation_tasks(completed_at)").eq("job_id", jobId).order("created_at", { ascending: false }),
    db.from("mock_interviews").select("id, mode, status, created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(10),
    getPrimaryResumeVersion(db),
  ]);

  let primaryLabel: string | null = null;
  if (primary) {
    const { data } = await db.from("resumes").select("label").eq("id", primary.resume_id).maybeSingle<{ label: string }>();
    primaryLabel = data?.label ?? null;
  }

  const c = candidate.data as unknown as (CandidateRow & { resume_versions: { version: number; resumes: { label: string } | null } | null }) | null;
  const app = application.data as {
    id: string;
    status: string;
    applied_at: string | null;
    notes: string | null;
    updated_at: string;
    application_events: { from_status: string | null; to_status: string; created_at: string }[];
    interview_sessions: { id: string; scheduled_at: string; timezone: string; round: string; notes: string | null }[];
  } | null;

  return {
    id: row.id,
    job: rowToJob(row),
    extraction: row.extraction as JobRowExtraction,
    capturedVia: row.captured_via,
    retrievedAt: row.retrieved_at,
    createdAt: row.created_at,
    archived: !!row.archived_at,
    saved: !!saved.data,
    analysis: analysis ? stripUser(analysis) : null,
    research: researchMeta.data
      ? {
          status: researchMeta.data.status,
          provider: researchMeta.data.provider,
          note: researchMeta.data.note,
          retrievedAt: researchMeta.data.retrieved_at,
          sources: (sources.data ?? []).map(rowToSource),
          claims: (claims.data ?? []).map(rowToClaim),
        }
      : null,
    candidate: c
      ? {
          id: c.id,
          resumeVersionId: c.resume_version_id,
          resumeLabel: c.resume_versions?.resumes?.label ?? null,
          resumeVersion: c.resume_versions?.version ?? null,
          createdAt: c.created_at,
          matches: c.matches,
          ats: c.ats_analyses[0]?.result ?? null,
          fit: c.fit_analyses[0]?.result ?? null,
        }
      : null,
    primaryResume: primary ? { versionId: primary.id, label: primaryLabel, version: primary.version } : null,
    application: app
      ? {
          id: app.id,
          status: app.status,
          appliedAt: app.applied_at,
          notes: app.notes,
          updatedAt: app.updated_at,
          events: [...app.application_events].sort((a, b) => b.created_at.localeCompare(a.created_at)),
          interviews: [...app.interview_sessions].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
        }
      : null,
    plans: ((plans.data ?? []) as { id: string; title: string; duration_days: number; personalized: boolean; created_at: string; preparation_tasks: { completed_at: string | null }[] }[]).map((p) => ({
      id: p.id,
      title: p.title,
      durationDays: p.duration_days,
      personalized: p.personalized,
      createdAt: p.created_at,
      total: p.preparation_tasks.length,
      done: p.preparation_tasks.filter((t) => t.completed_at).length,
    })),
    mockInterviews: ((mocks.data ?? []) as { id: string; mode: string; status: string; created_at: string }[]).map((m) => ({ id: m.id, mode: m.mode, status: m.status, createdAt: m.created_at })),
    capabilities: capabilities(),
  };
}

function stripUser(a: AnalysisRow): Omit<AnalysisRow, "user_id"> {
  const { user_id: _u, ...rest } = a;
  return rest;
}
