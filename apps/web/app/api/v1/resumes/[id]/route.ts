import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { deleteObject } from "@/lib/server/storage";

export const OPTIONS = preflight;

/** PATCH /api/v1/resumes/:id — rename or make primary. */
export const PATCH = authed<{ id: string }>("resumes.patch", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const body = await readJson(ctx.req, z.object({ label: z.string().min(1).max(120).optional(), primary: z.literal(true).optional() }));
  const { data: exists } = await ctx.db.from("resumes").select("id").eq("id", id).maybeSingle();
  if (!exists) throw new ElevateError("not_found", "Resume not found.");
  if (body.primary) {
    await ctx.db.from("resumes").update({ is_primary: false }).eq("is_primary", true).neq("id", id);
    await ctx.db.from("resumes").update({ is_primary: true }).eq("id", id);
  }
  if (body.label) await ctx.db.from("resumes").update({ label: body.label }).eq("id", id);
  return json(ctx.req, { ok: true });
});

/** DELETE /api/v1/resumes/:id — deletes the resume, all versions, stored files and comparisons made with it. */
export const DELETE = authed<{ id: string }>("resumes.delete", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const { data: versions } = await ctx.db.from("resume_versions").select("storage_key").eq("resume_id", id);
  const { data, error } = await ctx.db.from("resumes").delete().eq("id", id).select("id, is_primary").maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't delete the resume.");
  if (!data) throw new ElevateError("not_found", "Resume not found.");
  await Promise.allSettled((versions ?? []).filter((v) => v.storage_key).map((v) => deleteObject(v.storage_key!)));
  if (data.is_primary) {
    // Promote the most recently updated remaining resume, if any.
    const { data: next } = await ctx.db.from("resumes").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (next) await ctx.db.from("resumes").update({ is_primary: true }).eq("id", next.id);
  }
  return json(ctx.req, { ok: true });
});
