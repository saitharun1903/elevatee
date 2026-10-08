import { z } from "zod";
import { ApplicationPatch } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { upsertApplication } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** PUT /api/v1/jobs/:id/application — start or update application tracking for this job. */
export const PUT = authed<{ id: string }>("jobs.application", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  return json(ctx.req, await upsertApplication(ctx, id, await readJson(ctx.req, ApplicationPatch)));
});
