import "server-only";
import {
  CapturedPage,
  ElevateError,
  extractFromText,
  extractJob,
  ManualJobInput,
  safeFetchPage,
  type ExtractionResult,
} from "@elevate/core/server";
import { z } from "zod";
import type { Db } from "../supabase";
import { jobToRow, type JobRow } from "./rows";

export const AnalyzeRequest = z.discriminatedUnion("source", [
  z.object({ source: z.literal("capture"), page: CapturedPage }),
  z.object({ source: z.literal("url"), url: z.string().trim().url("Enter a full link starting with https://").max(2048) }),
  z.object({ source: z.literal("text") }).extend(ManualJobInput.shape),
]);
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

/** Turn any input into a normalized job using the shared extraction engine. */
export async function extractFromRequest(req: AnalyzeRequest): Promise<{ result: ExtractionResult; via: JobRow["captured_via"] }> {
  if (req.source === "text") {
    return { result: extractFromText(req), via: "text" };
  }
  if (req.source === "capture") {
    const { page } = req;
    return { result: extractJob({ url: page.url, html: page.html, title: page.title, selectionText: page.selectionText }), via: "extension" };
  }
  const page = await safeFetchPage(req.url);
  const result = extractJob({ url: page.finalUrl, html: page.body });
  return { result, via: "url" };
}

export function assertLooksLikeJob(result: ExtractionResult) {
  const j = result.job;
  const descLen = j.description?.length ?? 0;
  if (!j.title && descLen < 200) {
    throw new ElevateError(
      "not_a_job",
      "We couldn't find a job posting on that page. If the job is there, select the description and use the extension, or paste it here.",
      { details: { warnings: result.report.warnings } },
    );
  }
  if (descLen < 80 && j.requiredQualifications.length === 0 && j.responsibilities.length === 0) {
    throw new ElevateError("not_a_job", "We found a job title but no description. Paste the job description to analyze it.");
  }
}

/**
 * Insert the job or return the user's existing copy. Identity is checked by platform id,
 * then canonical URL, then content hash — never by company alone.
 */
export async function upsertJob(db: Db, userId: string, result: ExtractionResult, via: JobRow["captured_via"]): Promise<{ jobId: string; deduplicated: boolean; changed: boolean }> {
  const j = result.job;
  const existing = await findExisting(db, j.sourcePlatform, j.sourceJobId, j.canonicalUrl, result.contentHash);
  const row = { ...jobToRow(j), content_hash: result.contentHash, extraction: result.report, retrieved_at: new Date().toISOString() };

  if (existing) {
    if (existing.content_hash !== result.contentHash) {
      // Posting changed since last capture: refresh the stored copy (same job identity).
      await db.from("jobs").update({ ...row, captured_via: via }).eq("id", existing.id);
      return { jobId: existing.id, deduplicated: true, changed: true };
    }
    return { jobId: existing.id, deduplicated: true, changed: false };
  }
  const { data, error } = await db.from("jobs").insert({ ...row, user_id: userId, captured_via: via }).select("id").single<{ id: string }>();
  if (error?.code === "23505") {
    const again = await findExisting(db, j.sourcePlatform, j.sourceJobId, j.canonicalUrl, result.contentHash);
    if (again) return { jobId: again.id, deduplicated: true, changed: false };
  }
  if (error || !data) throw new ElevateError("internal", "Couldn't save the job.");
  return { jobId: data.id, deduplicated: false, changed: true };
}

async function findExisting(db: Db, platform: string, sourceJobId: string | null, canonicalUrl: string | null, hash: string) {
  const sel = "id, content_hash";
  if (sourceJobId) {
    const { data } = await db.from("jobs").select(sel).eq("source_platform", platform).eq("source_job_id", sourceJobId).maybeSingle<{ id: string; content_hash: string }>();
    if (data) return data;
  }
  if (canonicalUrl) {
    const { data } = await db.from("jobs").select(sel).eq("canonical_url", canonicalUrl).maybeSingle<{ id: string; content_hash: string }>();
    if (data) return data;
  }
  const { data } = await db.from("jobs").select(sel).eq("content_hash", hash).maybeSingle<{ id: string; content_hash: string }>();
  return data ?? null;
}

export const JobListQuery = z.object({
  view: z.enum(["all", "saved", "applications", "archived"]).default("all"),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(["recent", "posted", "company", "fit"]).default("recent"),
  status: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface JobListItem {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  workplaceType: string | null;
  sourcePlatform: string;
  postedAt: string | null;
  createdAt: string;
  archived: boolean;
  saved: boolean;
  applicationStatus: string | null;
  analysisStatus: string | null;
  fitScore: number | null;
}

export async function listJobs(db: Db, q: z.infer<typeof JobListQuery>): Promise<JobListItem[]> {
  let query = db
    .from("jobs")
    .select(
      "id, title, company, location, workplace_type, source_platform, posted_at, created_at, archived_at, saved_jobs(job_id), applications(status), job_analyses(status, created_at), fit_analyses:candidate_analyses(created_at, fit_analyses(score))",
    )
    .limit(q.limit);
  query = q.view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q.q) {
    const term = q.q.replace(/[%_,()]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,company.ilike.%${term}%,location.ilike.%${term}%`);
  }
  if (q.sort === "posted") query = query.order("posted_at", { ascending: false, nullsFirst: false });
  else if (q.sort === "company") query = query.order("company", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new ElevateError("internal", "Couldn't load your jobs.");
  type Row = {
    id: string;
    title: string | null;
    company: string | null;
    location: string | null;
    workplace_type: string | null;
    source_platform: string;
    posted_at: string | null;
    created_at: string;
    archived_at: string | null;
    // One-to-one embeds (unique on user_id + job_id) come back as an object or null.
    saved_jobs: { job_id: string } | { job_id: string }[] | null;
    applications: { status: string } | { status: string }[] | null;
    job_analyses: { status: string; created_at: string }[];
    fit_analyses: { created_at: string; fit_analyses: { score: number | null }[] }[];
  };
  let items = ((data ?? []) as unknown as Row[]).map<JobListItem>((r) => {
    const latest = [...asArray(r.job_analyses)].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const latestFit = [...asArray(r.fit_analyses)].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return {
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      workplaceType: r.workplace_type,
      sourcePlatform: r.source_platform,
      postedAt: r.posted_at,
      createdAt: r.created_at,
      archived: !!r.archived_at,
      saved: asArray(r.saved_jobs).length > 0,
      applicationStatus: asArray(r.applications)[0]?.status ?? null,
      analysisStatus: latest?.status ?? null,
      fitScore: asArray(latestFit?.fit_analyses)[0]?.score ?? null,
    };
  });
  if (q.view === "saved") items = items.filter((i) => i.saved);
  if (q.view === "applications") items = items.filter((i) => i.applicationStatus !== null);
  if (q.status) items = items.filter((i) => i.applicationStatus === q.status);
  if (q.sort === "fit") items.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
  return items;
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}
