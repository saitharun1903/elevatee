import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { getJobWorkspace } from "@/lib/server/services/workspace";

export const OPTIONS = preflight;
const Id = z.string().uuid("Invalid job id.");

/** GET /api/v1/jobs/:id — the full workspace view model. */
export const GET = authed<{ id: string }>("jobs.get", async (ctx) => {
  return json(ctx.req, await getJobWorkspace(ctx.db, Id.parse(ctx.params.id)));
});

/** PATCH /api/v1/jobs/:id — archive / restore. */
export const PATCH = authed<{ id: string }>("jobs.patch", async (ctx) => {
  const id = Id.parse(ctx.params.id);
  const body = await readJson(ctx.req, z.object({ archived: z.boolean() }));
  const { data, error } = await ctx.db
    .from("jobs")
    .update({ archived_at: body.archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't update the job.");
  if (!data) throw new ElevateError("not_found", "This job doesn't exist or isn't yours.");
  return json(ctx.req, { ok: true });
});

/** DELETE /api/v1/jobs/:id — removes the job and everything derived from it. */
export const DELETE = authed<{ id: string }>("jobs.delete", async (ctx) => {
  const id = Id.parse(ctx.params.id);
  const { data, error } = await ctx.db.from("jobs").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't delete the job.");
  if (!data) throw new ElevateError("not_found", "This job doesn't exist or isn't yours.");
  return json(ctx.req, { ok: true });
});
