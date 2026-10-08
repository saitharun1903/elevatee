import { z } from "zod";
import { authed, json, preflight } from "@/lib/server/http";
import { getJobRow, latestAnalysis, startAnalysis } from "@/lib/server/services/analysis";

export const maxDuration = 300;
export const OPTIONS = preflight;
const Id = z.string().uuid();

/** GET /api/v1/jobs/:id/analysis — latest analysis with stage states. */
export const GET = authed<{ id: string }>("jobs.analysis.get", async (ctx) => {
  const id = Id.parse(ctx.params.id);
  await ctx.db.rpc("close_stale_analyses");
  await getJobRow(ctx.db, id);
  return json(ctx.req, { analysis: await latestAnalysis(ctx.db, id) });
});

/** POST /api/v1/jobs/:id/analysis — re-run the full analysis. */
export const POST = authed<{ id: string }>("jobs.analysis.rerun", async (ctx) => {
  return json(ctx.req, await startAnalysis(ctx, Id.parse(ctx.params.id), "full"), { status: 202 });
});
