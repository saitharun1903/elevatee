import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";

export const OPTIONS = preflight;

/** GET /api/v1/notifications */
export const GET = authed("notifications.list", async (ctx) => {
  const { data, error } = await ctx.db.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
  if (error) throw new ElevateError("internal", "Couldn't load notifications.");
  return json(ctx.req, { notifications: data ?? [] });
});

/** PATCH /api/v1/notifications — mark ids (or all) as read. */
export const PATCH = authed("notifications.read", async (ctx) => {
  const body = await readJson(ctx.req, z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }));
  let q = ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (!body.all) q = q.in("id", body.ids ?? []);
  const { error } = await q;
  if (error) throw new ElevateError("internal", "Couldn't update notifications.");
  return json(ctx.req, { ok: true });
});
