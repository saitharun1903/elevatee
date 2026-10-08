import { z } from "zod";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { answerMockInterview } from "@/lib/server/services/workflow";

export const maxDuration = 60;
export const OPTIONS = preflight;

/** POST /api/v1/mock-interviews/:id/answer — { answer } → feedback + next question. */
export const POST = authed<{ id: string }>("mock_interviews.answer", async (ctx) => {
  const body = await readJson(ctx.req, z.object({ answer: z.string().trim().min(1, "Write an answer first.").max(6000) }));
  return json(ctx.req, await answerMockInterview(ctx, z.string().uuid().parse(ctx.params.id), body.answer));
});
