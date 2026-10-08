import { z } from "zod";
import { InterviewMode } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { startMockInterview } from "@/lib/server/services/workflow";

export const maxDuration = 60;
export const OPTIONS = preflight;

/** POST /api/v1/jobs/:id/mock-interview — start a practice session for this job. */
export const POST = authed<{ id: string }>("jobs.mock_interview", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const body = await readJson(ctx.req, z.object({ mode: InterviewMode }));
  return json(ctx.req, await startMockInterview(ctx, id, body.mode), { status: 201 });
});
