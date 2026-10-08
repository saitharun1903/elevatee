import { authed, json, preflight, readJson } from "@/lib/server/http";
import { AnalyzeRequest, assertLooksLikeJob, extractFromRequest, upsertJob } from "@/lib/server/services/jobs";
import { latestAnalysis, startAnalysis } from "@/lib/server/services/analysis";

export const maxDuration = 300;
export const OPTIONS = preflight;

/** POST /api/v1/jobs/analyze — capture (extension), URL or pasted text → normalized job → analysis. */
export const POST = authed("jobs.analyze", async (ctx) => {
  const body = await readJson(ctx.req, AnalyzeRequest);
  const { result, via } = await extractFromRequest(body);
  assertLooksLikeJob(result);
  const { jobId, deduplicated, changed } = await upsertJob(ctx.db, ctx.userId, result, via);
  // Same job, same content: reuse the existing analysis instead of paying for a new one.
  const previous = deduplicated && !changed ? await latestAnalysis(ctx.db, jobId) : null;
  const { analysisId, reused } = previous ? { analysisId: previous.id, reused: true } : await startAnalysis(ctx, jobId, "full");
  return json(
    ctx.req,
    {
      jobId,
      analysisId,
      deduplicated,
      reusedAnalysis: reused,
      extraction: { warnings: result.report.warnings, completeness: result.report.completeness },
    },
    { status: deduplicated ? 200 : 201 },
  );
});
