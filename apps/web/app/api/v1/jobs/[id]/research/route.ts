import { z } from "zod";
import { authed, json, preflight } from "@/lib/server/http";
import { startAnalysis } from "@/lib/server/services/analysis";

export const maxDuration = 300;
export const OPTIONS = preflight;

/** POST /api/v1/jobs/:id/research — refresh research only (reuses the job intelligence). */
export const POST = authed<{ id: string }>("jobs.research.refresh", async (ctx) => {
  return json(ctx.req, await startAnalysis(ctx, z.string().uuid().parse(ctx.params.id), "research"), { status: 202 });
});
