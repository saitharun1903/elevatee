import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { capabilities } from "@/lib/server/providers";

export const OPTIONS = preflight;

/** GET /api/v1/me — profile, preferences and server capabilities (provider names only). */
export const GET = authed("me.get", async (ctx) => {
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    ctx.db.from("profiles").select("display_name, locale, country, currency, timezone, target_roles").eq("id", ctx.userId).maybeSingle(),
    ctx.db.from("user_preferences").select("theme, default_prep_days, product_analytics").eq("user_id", ctx.userId).maybeSingle(),
  ]);
  return json(ctx.req, { userId: ctx.userId, email: ctx.email, profile, preferences: prefs, capabilities: capabilities() });
});

const Patch = z.object({
  profile: z
    .object({
      display_name: z.string().trim().max(120).nullable().optional(),
      locale: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).nullable().optional(),
      country: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
      timezone: z.string().max(64).nullable().optional(),
    })
    .optional(),
  preferences: z
    .object({
      theme: z.enum(["system", "light", "dark"]).optional(),
      default_prep_days: z.number().int().min(1).max(60).nullable().optional(),
      product_analytics: z.boolean().optional(),
    })
    .optional(),
});

/** PATCH /api/v1/me */
export const PATCH = authed("me.patch", async (ctx) => {
  const body = await readJson(ctx.req, Patch);
  if (body.profile?.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: body.profile.timezone });
    } catch {
      throw new ElevateError("invalid_input", "Unknown time zone.");
    }
  }
  if (body.profile && Object.keys(body.profile).length) {
    const { error } = await ctx.db.from("profiles").update(body.profile).eq("id", ctx.userId);
    if (error) throw new ElevateError("internal", "Couldn't save your profile.");
  }
  if (body.preferences && Object.keys(body.preferences).length) {
    const { error } = await ctx.db.from("user_preferences").update(body.preferences).eq("user_id", ctx.userId);
    if (error) throw new ElevateError("internal", "Couldn't save your preferences.");
  }
  return json(ctx.req, { ok: true });
});
