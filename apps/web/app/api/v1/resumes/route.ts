import { z } from "zod";
import { ElevateError, RESUME_LIMITS } from "@elevate/core";
import { authed, json, preflight } from "@/lib/server/http";
import { createResumeVersion, listResumes } from "@/lib/server/services/resumes";

export const maxDuration = 120;
export const OPTIONS = preflight;

const TextBody = z.object({
  text: z.string().min(RESUME_LIMITS.minTextChars, "Paste your full resume — that's too short to analyze.").max(RESUME_LIMITS.maxTextChars),
  label: z.string().max(120).optional(),
  resumeId: z.string().uuid().optional(),
});

/** GET /api/v1/resumes — resumes with their versions. */
export const GET = authed("resumes.list", async (ctx) => json(ctx.req, { resumes: await listResumes(ctx.db) }));

/**
 * POST /api/v1/resumes — multipart (file, label?, resumeId?) or JSON ({ text, label?, resumeId? }).
 * Passing resumeId adds a new version to an existing resume.
 */
export const POST = authed("resumes.create", async (ctx) => {
  const type = ctx.req.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) {
    const len = Number(ctx.req.headers.get("content-length") ?? 0);
    if (len > RESUME_LIMITS.maxBytes + 64 * 1024) throw new ElevateError("unsupported_file", "Resume files must be 5 MB or smaller.");
    const form = await ctx.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ElevateError("invalid_input", "Choose a PDF or DOCX file to upload.");
    if (file.size > RESUME_LIMITS.maxBytes) throw new ElevateError("unsupported_file", "Resume files must be 5 MB or smaller.");
    const resumeId = z.string().uuid().optional().parse(form.get("resumeId") || undefined);
    const label = z.string().max(120).optional().parse(form.get("label") || undefined);
    const out = await createResumeVersion(ctx, {
      resumeId,
      label,
      file: { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name || "resume", mime: file.type || "application/octet-stream" },
    });
    return json(ctx.req, out, { status: 201 });
  }
  const raw = await ctx.req.json().catch(() => undefined);
  const body = TextBody.parse(raw);
  return json(ctx.req, await createResumeVersion(ctx, { resumeId: body.resumeId, label: body.label, text: body.text }), { status: 201 });
});
