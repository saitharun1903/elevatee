import { z } from "zod";
import { ApplicationPatch } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { patchApplication } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** PATCH /api/v1/applications/:id — status, notes, applied date. */
export const PATCH = authed<{ id: string }>("applications.patch", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  return json(ctx.req, await patchApplication(ctx, id, await readJson(ctx.req, ApplicationPatch)));
});
