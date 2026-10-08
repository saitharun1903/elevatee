import { z } from "zod";
import { ScheduledInterviewInput } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { scheduleInterview } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** POST /api/v1/applications/:id/interviews — record a real scheduled interview. */
export const POST = authed<{ id: string }>("applications.interviews.create", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  return json(ctx.req, await scheduleInterview(ctx, id, await readJson(ctx.req, ScheduledInterviewInput)), { status: 201 });
});
