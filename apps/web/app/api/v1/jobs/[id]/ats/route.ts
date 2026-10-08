import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { computeAts } from "@elevate/core/server";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { getJobRow, latestAnalysis } from "@/lib/server/services/analysis";
import { getPrimaryResumeVersion } from "@/lib/server/services/resumes";
import { rowToJob, type ResumeVersionRow } from "@/lib/server/services/rows";

export const OPTIONS = preflight;

/**
 * POST /api/v1/jobs/:id/ats — recompute the deterministic ATS estimate for a resume version.
 * Uses the stored job intelligence and, when present, the stored comparison for that version. No AI call.
 */
export const POST = authed<{ id: string }>("jobs.ats", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const body = await readJson(ctx.req, z.object({ resumeVersionId: z.string().uuid().optional() }).default({}));
  const job = await getJobRow(ctx.db, id);
  const analysis = await latestAnalysis(ctx.db, id);
  if (!analysis?.intelligence) throw new ElevateError("invalid_input", "Analyze this job first.");
  const version = body.resumeVersionId
    ? ((await ctx.db.from("resume_versions").select("*").eq("id", body.resumeVersionId).maybeSingle<ResumeVersionRow>()).data ?? null)
    : await getPrimaryResumeVersion(ctx.db);
  if (!version) throw new ElevateError("invalid_input", "ATS unavailable — add your resume first.");
  const { data: cand } = await ctx.db
    .from("candidate_analyses")
    .select("matches")
    .eq("job_id", id)
    .eq("resume_version_id", version.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ats = computeAts({
    job: rowToJob(job),
    intel: analysis.intelligence,
    resumeText: version.raw_text,
    parsed: version.parsed,
    matches: cand?.matches ?? null,
  });
  return json(ctx.req, { resumeVersionId: version.id, ats });
});
