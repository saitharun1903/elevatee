import "server-only";
import {
  cleanResumeText,
  ElevateError,
  extractResumeText,
  parseResumeWithAI,
  RESUME_LIMITS,
  textOnlyParse,
  type ParsedResume,
} from "@elevate/core/server";
import type { Db } from "../supabase";
import { ai } from "../providers";
import { log } from "../log";
import { putObject, storageConfigured } from "../storage";
import type { ResumeVersionRow } from "./rows";
import { trackEvent } from "./events";

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getPrimaryResumeVersion(db: Db): Promise<ResumeVersionRow | null> {
  const { data: resume } = await db.from("resumes").select("id").eq("is_primary", true).maybeSingle<{ id: string }>();
  if (!resume) return null;
  const { data } = await db
    .from("resume_versions")
    .select("*")
    .eq("resume_id", resume.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<ResumeVersionRow>();
  return data ?? null;
}

export interface CreateResumeInput {
  resumeId?: string | null;
  label?: string | null;
  file?: { bytes: Uint8Array; name: string; mime: string } | null;
  text?: string | null;
}

/**
 * Store a new resume version. Never modifies an existing version: analyses keep pointing at
 * the exact text they were computed from.
 */
export async function createResumeVersion(ctx: { db: Db; userId: string; requestId: string }, input: CreateResumeInput) {
  let sourceType: "pdf" | "docx" | "text";
  let rawText: string;
  if (input.file) {
    const out = await extractResumeText(input.file.bytes);
    sourceType = out.type;
    rawText = out.text;
  } else if (input.text) {
    rawText = cleanResumeText(input.text);
    sourceType = "text";
    if (rawText.length < RESUME_LIMITS.minTextChars) throw new ElevateError("invalid_input", "Paste your full resume — that's too short to analyze.");
  } else {
    throw new ElevateError("invalid_input", "Upload a file or paste your resume text.");
  }

  // Resolve or create the parent resume.
  let resumeId = input.resumeId ?? null;
  if (resumeId) {
    const { data } = await ctx.db.from("resumes").select("id").eq("id", resumeId).maybeSingle();
    if (!data) throw new ElevateError("not_found", "That resume doesn't exist.");
  } else {
    const { count } = await ctx.db.from("resumes").select("id", { count: "exact", head: true });
    const label = input.label?.trim() || input.file?.name.replace(/\.(pdf|docx)$/i, "").slice(0, 120) || "Resume";
    const { data, error } = await ctx.db
      .from("resumes")
      .insert({ user_id: ctx.userId, label, is_primary: (count ?? 0) === 0 })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new ElevateError("internal", "Couldn't save the resume.");
    resumeId = data.id;
  }

  const { data: last } = await ctx.db
    .from("resume_versions")
    .select("version")
    .eq("resume_id", resumeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  const version = (last?.version ?? 0) + 1;
  const versionId = crypto.randomUUID();

  // Original file goes to private object storage when configured.
  let storageKey: string | null = null;
  if (input.file && storageConfigured()) {
    storageKey = `resumes/${ctx.userId}/${versionId}.${sourceType}`;
    try {
      await putObject(storageKey, input.file.bytes, sourceType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } catch (err) {
      log.warn("resume.storage_failed", { requestId: ctx.requestId, code: err instanceof ElevateError ? err.code : "unknown" });
      storageKey = null;
    }
  }

  // Structured parsing: AI when configured, otherwise deterministic contact fields only.
  let parsed: ParsedResume = textOnlyParse(rawText);
  let parseStatus: ResumeVersionRow["parse_status"] = "text_only";
  let warnings: string[] = [];
  let provider: string | null = null;
  const aiProvider = ai();
  if (aiProvider) {
    try {
      const out = await parseResumeWithAI(aiProvider, rawText);
      parsed = out.parsed;
      warnings = out.warnings;
      parseStatus = "parsed";
      provider = `${out.provider}:${out.model}`;
    } catch (err) {
      parseStatus = "text_only";
      warnings = [`Structured parsing failed: ${err instanceof ElevateError ? err.userMessage : "unknown error"}. The text is saved and used for keyword checks.`];
    }
  } else {
    warnings = ["Structured parsing needs an AI provider. Text was saved and is used for keyword checks."];
  }

  const { data: row, error } = await ctx.db
    .from("resume_versions")
    .insert({
      id: versionId,
      user_id: ctx.userId,
      resume_id: resumeId,
      version,
      source_type: sourceType,
      file_name: input.file?.name.slice(0, 255) ?? null,
      mime_type: input.file ? input.file.mime.slice(0, 120) : "text/plain",
      byte_size: input.file?.bytes.byteLength ?? new TextEncoder().encode(rawText).byteLength,
      storage_key: storageKey,
      content_hash: await sha256Hex(rawText),
      raw_text: rawText,
      parse_status: parseStatus,
      parsed,
      parse_warnings: warnings,
      parse_provider: provider,
    })
    .select("*")
    .single<ResumeVersionRow>();
  if (error || !row) throw new ElevateError("internal", "Couldn't save the resume version.");
  await ctx.db.from("resumes").update({ updated_at: new Date().toISOString() }).eq("id", resumeId);
  await trackEvent(ctx.db, ctx.userId, "resume_uploaded", { sourceType, parseStatus });
  return { resumeId, version: row };
}

export async function listResumes(db: Db) {
  const { data, error } = await db
    .from("resumes")
    .select("id, label, is_primary, created_at, updated_at, resume_versions(id, version, source_type, file_name, byte_size, storage_key, parse_status, parsed, parse_warnings, created_at)")
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new ElevateError("internal", "Couldn't load resumes.");
  return (data ?? []).map((r) => ({
    ...r,
    resume_versions: [...((r.resume_versions as { version: number }[]) ?? [])].sort((a, b) => b.version - a.version),
  }));
}
