import { z } from "zod";
import { authed, json, preflight } from "@/lib/server/http";
import { deleteInterviewSession } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** DELETE /api/v1/interview-sessions/:id */
export const DELETE = authed<{ id: string }>("interview_sessions.delete", async (ctx) => {
  await deleteInterviewSession(ctx.db, z.string().uuid().parse(ctx.params.id));
  return json(ctx.req, { ok: true });
});
