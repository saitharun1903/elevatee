import { z } from "zod";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { startAnalysis } from "@/lib/server/services/analysis";

export const maxDuration = 300;
export const OPTIONS = preflight;

/** POST /api/v1/jobs/:id/candidate-analysis — compare a resume version (default: primary) with this job. */
export const POST = authed<{ id: string }>("jobs.candidate", async (ctx) => {
  const body = await readJson(ctx.req, z.object({ resumeVersionId: z.string().uuid().optional() }).default({}));
  const id = z.string().uuid().parse(ctx.params.id);
  return json(ctx.req, await startAnalysis(ctx, id, "candidate", { resumeVersionId: body.resumeVersionId }), { status: 202 });
});
