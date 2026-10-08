import { z } from "zod";
import { authed, json, preflight } from "@/lib/server/http";
import { endMockInterview } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** POST /api/v1/mock-interviews/:id/end — end an active session early. */
export const POST = authed<{ id: string }>("mock_interviews.end", async (ctx) => {
  await endMockInterview(ctx.db, z.string().uuid().parse(ctx.params.id));
  return json(ctx.req, { ok: true });
});
