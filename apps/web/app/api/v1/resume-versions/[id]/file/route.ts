import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { authed, json, preflight } from "@/lib/server/http";
import { signedGetUrl } from "@/lib/server/storage";

export const OPTIONS = preflight;

/** GET /api/v1/resume-versions/:id/file — short-lived signed download URL for the original file. */
export const GET = authed<{ id: string }>("resume_versions.file", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const { data } = await ctx.db.from("resume_versions").select("storage_key, file_name").eq("id", id).maybeSingle();
  if (!data) throw new ElevateError("not_found", "Resume version not found.");
  if (!data.storage_key) throw new ElevateError("not_found", "The original file wasn't stored for this version.");
  const url = await signedGetUrl(data.storage_key, data.file_name ?? "resume");
  if (!url) throw new ElevateError("provider_unavailable", "File storage isn't configured on this server.");
  return json(ctx.req, { url, expiresInSeconds: 300 });
});
