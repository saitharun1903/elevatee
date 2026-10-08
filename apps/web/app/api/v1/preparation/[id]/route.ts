import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { getPlan } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;
const Id = z.string().uuid();

/** GET /api/v1/preparation/:id */
export const GET = authed<{ id: string }>("preparation.get", async (ctx) => json(ctx.req, await getPlan(ctx.db, Id.parse(ctx.params.id))));

/** PATCH /api/v1/preparation/:id — archive or reactivate. */
export const PATCH = authed<{ id: string }>("preparation.patch", async (ctx) => {
  const body = await readJson(ctx.req, z.object({ status: z.enum(["active", "archived"]) }));
  const { data, error } = await ctx.db.from("preparation_plans").update({ status: body.status }).eq("id", Id.parse(ctx.params.id)).select("id").maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't update the plan.");
  if (!data) throw new ElevateError("not_found", "Plan not found.");
  return json(ctx.req, { ok: true });
});

/** DELETE /api/v1/preparation/:id */
export const DELETE = authed<{ id: string }>("preparation.delete", async (ctx) => {
  const { data, error } = await ctx.db.from("preparation_plans").delete().eq("id", Id.parse(ctx.params.id)).select("id").maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't delete the plan.");
  if (!data) throw new ElevateError("not_found", "Plan not found.");
  return json(ctx.req, { ok: true });
});
