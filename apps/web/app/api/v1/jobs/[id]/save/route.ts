import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight } from "@/lib/server/http";
import { trackEvent } from "@/lib/server/services/events";

export const OPTIONS = preflight;

/** POST /api/v1/jobs/:id/save */
export const POST = authed<{ id: string }>("jobs.save", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const { error } = await ctx.db
    .from("saved_jobs")
    .upsert({ user_id: ctx.userId, job_id: id }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  if (error?.code === "23503") throw new ElevateError("not_found", "This job doesn't exist or isn't yours.");
  if (error) throw new ElevateError("internal", "Couldn't save the job.");
  await trackEvent(ctx.db, ctx.userId, "job_saved");
  return json(ctx.req, { saved: true });
});

/** DELETE /api/v1/jobs/:id/save */
export const DELETE = authed<{ id: string }>("jobs.unsave", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const { error } = await ctx.db.from("saved_jobs").delete().eq("job_id", id);
  if (error) throw new ElevateError("internal", "Couldn't update the job.");
  return json(ctx.req, { saved: false });
});
