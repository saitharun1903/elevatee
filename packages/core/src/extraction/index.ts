/**
 * Job extraction engine: turns a captured page (or pasted text) into a NormalizedJob.
 *
 * Pure, synchronous and browser-safe. Product rule: never invent data — every field stays
 * null/empty unless the input actually contains it.
 */
import { NormalizedJob } from "../schemas/job";
import type { ExtractionMethod, ExtractionResult, ManualJobInput, SourcePlatform } from "../schemas/job";
import { runAdapter } from "./adapters";
import { canonicalizeUrl, detectPlatform, hostOf, isJobBoardHost, isJobBoardName, resolveHttpUrl } from "./canonical";
import { countryFromLocation, toCountryCode } from "./countries";
import { sha256Hex } from "./hash";
import { collapseWhitespace, htmlToText, normalizeMultiline, parseHtml } from "./html";
import { fromScan, extractMicrodata, scanJsonLd } from "./jsonld";
import { extractMeta, readPageMeta, stripBoardSuffix } from "./meta";
import {
  extractEducation,
  extractEmploymentType,
  extractExperience,
  extractSalaryFromText,
  extractWorkplaceType,
  segmentSections,
  stripBullet,
} from "./sections";
import { extractSemantic, fieldsFromPairs, pairsFromText } from "./semantic";
import type { JobFields, PartialJob, SourceExtraction } from "./types";

export { detectPlatform, canonicalizeUrl, isJobBoardHost } from "./canonical";
export { htmlToText } from "./html";
export {
  extractExperience,
  extractEducation,
  extractSalaryFromText,
  extractWorkplaceType,
  extractEmploymentType,
  segmentSections,
} from "./sections";
export { sha256Hex } from "./hash";
export type { PlatformInfo } from "./canonical";
export type { DescriptionSections } from "./sections";

export interface ExtractJobInput {
  url: string;
  html: string;
  /** document.title as captured by the browser. */
  title?: string;
  /** User-selected text; used as the description when it has at least 200 characters. */
  selectionText?: string;
}

export interface QuickDetectResult {
  isLikelyJob: boolean;
  title: string | null;
  company: string | null;
  location: string | null;
  platform: SourcePlatform;
  confidence: "high" | "medium" | "low";
}

const MAX_HTML = 3_000_000;
const SCALAR_KEYS = [
  "title", "company", "companyWebsite", "location", "country", "workplaceType", "employmentType",
  "postedAt", "validThrough", "salary", "experience", "education", "applicationUrl", "sourceJobId",
] as const satisfies ReadonlyArray<keyof JobFields>;
const LIST_KEYS = ["responsibilities", "requiredQualifications", "preferredQualifications", "benefits"] as const satisfies ReadonlyArray<keyof JobFields>;
const LIST_LIMITS: Record<(typeof LIST_KEYS)[number], { items: number; length: number }> = {
  responsibilities: { items: 80, length: 1000 },
  requiredQualifications: { items: 80, length: 1000 },
  preferredQualifications: { items: 80, length: 1000 },
  benefits: { items: 60, length: 600 },
};

const CONFIDENTIAL_COMPANY = /^(?:confidential|company confidential|confidential company|hidden|undisclosed|private|private advertiser|anonymous|not disclosed|n\/a|na|none|-+)$/i;

function emptyFields(): JobFields {
  return {
    title: null, company: null, companyWebsite: null, location: null, country: null, workplaceType: null,
    employmentType: null, postedAt: null, validThrough: null, description: null, responsibilities: [],
    requiredQualifications: [], preferredQualifications: [], benefits: [], education: null, experience: null,
    salary: null, applicationUrl: null, sourceJobId: null,
  };
}

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function cleanLine(v: string | null | undefined, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = collapseWhitespace(v);
  return t ? clip(t, max) : null;
}

function wordCount(s: string): number {
  return (s.match(/\p{L}{2,}/gu) ?? []).length;
}

/** Trim, strip bullets, drop <3-char items, dedupe (case-insensitive), cap item length and count. */
function sanitizeList(items: readonly string[] | undefined, maxItems: number, maxLen: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items ?? []) {
    if (typeof raw !== "string") continue;
    const line = collapseWhitespace(raw);
    const item = collapseWhitespace(stripBullet(line) ?? line);
    if (item.length < 3) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clip(item, maxLen));
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Per-source cleanup applied before merging, so a bad value never shadows a good one. */
function sanitizeSource(src: SourceExtraction, warnings: string[]): SourceExtraction {
  const f: PartialJob = { ...src.fields };
  if (f.title !== undefined) {
    let t = cleanLine(f.title, 300);
    if (t && src.method === "meta") t = stripBoardSuffix(t) || null;
    if (t && isJobBoardName(t)) t = null;
    f.title = t;
  }
  if (f.company !== undefined) {
    let c = cleanLine(f.company, 200);
    if (c && isJobBoardName(c)) {
      warnings.push(`Ignored "${c}" as company: it is a job board, not the employer`);
      c = null;
    } else if (c && CONFIDENTIAL_COMPANY.test(c)) {
      warnings.push("Employer is not disclosed in the posting");
      c = null;
    }
    f.company = c;
  }
  if (f.companyWebsite !== undefined) {
    const u = resolveHttpUrl(f.companyWebsite);
    const h = hostOf(u);
    f.companyWebsite = u && h && !isJobBoardHost(h) ? u : null;
  }
  if (f.applicationUrl !== undefined) f.applicationUrl = resolveHttpUrl(f.applicationUrl);
  if (f.location !== undefined) f.location = cleanLine(f.location, 300);
  if (f.country !== undefined) f.country = toCountryCode(f.country);
  if (f.sourceJobId !== undefined) f.sourceJobId = cleanLine(f.sourceJobId, 200);
  if (f.description !== undefined) {
    const d = f.description ? normalizeMultiline(f.description) : "";
    // Markup debris or a lone word is not a description.
    f.description = d && wordCount(d) >= 3 ? d.slice(0, 60_000) : null;
  }
  for (const key of LIST_KEYS) {
    if (f[key] !== undefined) f[key] = sanitizeList(f[key], LIST_LIMITS[key].items, LIST_LIMITS[key].length);
  }
  return { ...src, fields: f };
}

interface Merged {
  fields: JobFields;
  fieldSources: Record<string, ExtractionMethod>;
}

const STRUCTURED_DESCRIPTION: ReadonlySet<ExtractionMethod> = new Set(["json_ld", "microdata", "platform_dom"]);

function merge(sources: SourceExtraction[]): Merged {
  const fields = emptyFields();
  const fieldSources: Record<string, ExtractionMethod> = {};
  for (const key of SCALAR_KEYS) {
    for (const s of sources) {
      const v = s.fields[key];
      if (isPresent(v)) {
        (fields as unknown as Record<string, unknown>)[key] = v;
        fieldSources[key] = s.method;
        break;
      }
    }
  }
  for (const key of LIST_KEYS) {
    for (const s of sources) {
      const v = s.fields[key];
      if (v && v.length) {
        fields[key] = v;
        fieldSources[key] = s.method;
        break;
      }
    }
  }
  // Description: longest structured one; the generic semantic text only wins when it is much
  // longer (structured source truncated) because it tends to carry page chrome.
  let best: { text: string; method: ExtractionMethod } | null = null;
  for (const s of sources) {
    const d = s.fields.description;
    if (!d || !STRUCTURED_DESCRIPTION.has(s.method)) continue;
    if (!best || d.length > best.text.length) best = { text: d, method: s.method };
  }
  const semantic = sources.find((s) => s.method === "semantic_dom")?.fields.description ?? null;
  if (
    semantic &&
    (!best || semantic.length > best.text.length * 1.5 || (best.text.length < 200 && semantic.length > best.text.length))
  ) {
    best = { text: semantic, method: "semantic_dom" };
  }
  if (!best) {
    const meta = sources.find((s) => s.method === "meta")?.fields.description;
    if (meta) best = { text: meta, method: "meta" };
  }
  if (best) {
    fields.description = best.text;
    fieldSources.description = best.method;
  }
  return { fields, fieldSources };
}

/** Fill gaps from the description text (and explicit workplace hints in the location). */
function deriveFromText(m: Merged, method: ExtractionMethod): void {
  const { fields, fieldSources } = m;
  const text = fields.description;
  if (!fields.country && fields.location) {
    const c = countryFromLocation(fields.location);
    if (c) {
      fields.country = c;
      fieldSources.country = fieldSources.location ?? method;
    }
  }
  if (!fields.workplaceType && fields.location) {
    const w = extractWorkplaceType(fields.location);
    if (w) {
      fields.workplaceType = w;
      fieldSources.workplaceType = fieldSources.location ?? method;
    }
  }
  if (!text) return;
  const sections = segmentSections(text);
  for (const key of LIST_KEYS) {
    if (!fields[key].length) {
      const items = sanitizeList(sections[key], LIST_LIMITS[key].items, LIST_LIMITS[key].length);
      if (items.length) {
        fields[key] = items;
        fieldSources[key] = method;
      }
    }
  }
  const fill = <K extends keyof JobFields>(key: K, value: JobFields[K] | null) => {
    if (!isPresent(fields[key]) && isPresent(value)) {
      fields[key] = value as JobFields[K];
      fieldSources[key] = method;
    }
  };
  fill("experience", extractExperience(text));
  fill("education", extractEducation(text));
  fill("salary", extractSalaryFromText(text));
  fill("workplaceType", extractWorkplaceType(text));
  fill("employmentType", extractEmploymentType(text));
}

/** Final pass: schema caps, warnings, validation (invalid values are nulled, never loosened). */
function finalize(
  m: Merged,
  ctx: { canonicalUrl: string | null; platform: SourcePlatform; urlJobId: string | null; warnings: string[]; methodsTried: string[] },
): ExtractionResult {
  const { fields, fieldSources } = m;
  const warnings = ctx.warnings;
  if (ctx.urlJobId) {
    fields.sourceJobId = ctx.urlJobId;
    delete fieldSources.sourceJobId;
  }
  if (fields.salary) {
    const s = fields.salary;
    fields.salary = {
      ...s,
      currency: s.currency && /^[A-Z]{3}$/.test(s.currency) ? s.currency : null,
      raw: s.raw ? clip(s.raw, 300) : null,
    };
    if (!fields.salary.currency) warnings.push("Salary currency is not stated or is ambiguous");
  }
  if (fields.experience?.raw) fields.experience = { ...fields.experience, raw: clip(fields.experience.raw, 400) };
  if (fields.education) {
    fields.education = {
      ...fields.education,
      fields: fields.education.fields.map((f) => clip(f, 120)).slice(0, 10),
      raw: fields.education.raw ? clip(fields.education.raw, 400) : null,
    };
  }
  if (fieldSources.company === "meta") warnings.push("Company inferred from site name");
  if (!fields.title) warnings.push("Job title could not be identified");
  if (!fields.company) warnings.push("Company could not be identified");
  if (!fields.description) warnings.push("No job description found");
  else if (fields.description.length < 300) warnings.push("Description is very short");

  const { sourceJobId, ...rest } = fields;
  const candidate = {
    canonicalUrl: ctx.canonicalUrl,
    sourcePlatform: ctx.platform,
    sourceJobId,
    ...rest,
  };
  let parsed = NormalizedJob.safeParse(candidate);
  for (let attempt = 0; !parsed.success && attempt < 5; attempt++) {
    const bad = new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")));
    for (const key of bad) {
      if (!(key in candidate)) continue;
      const rec = candidate as Record<string, unknown>;
      rec[key] = Array.isArray(rec[key]) ? [] : key === "sourcePlatform" ? "company_site" : null;
      delete fieldSources[key];
      warnings.push(`Discarded invalid value for ${key}`);
    }
    parsed = NormalizedJob.safeParse(candidate);
  }
  const job = NormalizedJob.parse(candidate);
  for (const key of Object.keys(fieldSources)) {
    if (!isPresent((job as Record<string, unknown>)[key])) delete fieldSources[key];
  }
  const core = [job.title, job.company, job.description].filter((v) => isPresent(v)).length;
  return {
    job,
    report: {
      fieldSources,
      methodsTried: ctx.methodsTried,
      warnings: [...new Set(warnings)],
      completeness: Math.round((core / 3) * 1000) / 1000,
    },
    contentHash: computeContentHash(job),
  };
}

function validUrl(url: string): string | null {
  return resolveHttpUrl(url);
}

/** Extract a normalized job from a captured page. */
export function extractJob(input: ExtractJobInput): ExtractionResult {
  const url = typeof input?.url === "string" ? input.url : "";
  const html = typeof input?.html === "string" ? input.html.slice(0, MAX_HTML) : "";
  const baseUrl = validUrl(url);
  const { platform, sourceJobId: urlJobId } = detectPlatform(url);
  const root = parseHtml(html);
  const warnings: string[] = [];
  const methodsTried: string[] = [];
  const raw: SourceExtraction[] = [];
  const push = (s: SourceExtraction | null) => {
    if (s) {
      raw.push(s);
      warnings.push(...s.warnings);
    }
  };

  methodsTried.push("json_ld");
  const scan = scanJsonLd(root);
  if (scan.invalidBlocks) warnings.push(`Ignored ${scan.invalidBlocks} invalid JSON-LD block(s)`);
  push(fromScan(scan, baseUrl));
  methodsTried.push("microdata");
  push(extractMicrodata(root, baseUrl));
  const pageMeta = readPageMeta(root, input?.title);
  if (platform !== "company_site") {
    methodsTried.push("platform_dom");
    push(runAdapter(platform, { root, url, documentTitle: pageMeta.documentTitle }));
  }
  methodsTried.push("semantic_dom");
  push(extractSemantic(root));
  methodsTried.push("meta");
  push(extractMeta(root, url, input?.title));

  if (!raw.some((s) => s.method === "json_ld" || s.method === "microdata")) warnings.push("No structured job data found");
  const sources = raw.map((s) => sanitizeSource(s, warnings));
  const merged = merge(sources);

  const selection = typeof input?.selectionText === "string" ? normalizeMultiline(input.selectionText) : "";
  if (selection.length >= 200) {
    methodsTried.push("manual_text");
    merged.fields.description = selection.slice(0, 60_000);
    merged.fieldSources.description = "manual_text";
  }
  deriveFromText(merged, "semantic_dom");
  return finalize(merged, {
    canonicalUrl: baseUrl ? canonicalizeUrl(baseUrl) : null,
    platform,
    urlJobId,
    warnings,
    methodsTried,
  });
}

/** Extract a job from text the user pasted. Title/company/location only from explicit input. */
export function extractFromText(input: ManualJobInput): ExtractionResult {
  const rawText = typeof input?.text === "string" ? input.text.slice(0, 60_000) : "";
  const text = /<\/?[a-z][^>]*>/i.test(rawText) ? htmlToText(rawText) : normalizeMultiline(rawText);
  const url = input?.url ? validUrl(input.url) : null;
  const { platform, sourceJobId } = url ? detectPlatform(url) : { platform: "manual" as SourcePlatform, sourceJobId: null };
  const warnings: string[] = [];
  const labelled = fieldsFromPairs(pairsFromText(text));
  const user: PartialJob = {
    title: input?.title ?? null,
    company: input?.company ?? null,
    location: input?.location ?? null,
  };
  const sources = [
    { method: "manual_text" as const, fields: user, warnings: [] },
    { method: "manual_text" as const, fields: { ...labelled, description: text || null }, warnings: [] },
  ].map((s) => sanitizeSource(s, warnings));
  const merged = merge([]);
  for (const s of sources) {
    for (const key of SCALAR_KEYS) {
      const v = s.fields[key];
      if (!isPresent(merged.fields[key]) && isPresent(v)) {
        (merged.fields as unknown as Record<string, unknown>)[key] = v;
        merged.fieldSources[key] = "manual_text";
      }
    }
  }
  const description = sources[1]?.fields.description ?? null;
  if (description) {
    merged.fields.description = description;
    merged.fieldSources.description = "manual_text";
  }
  deriveFromText(merged, "manual_text");
  return finalize(merged, {
    canonicalUrl: url ? canonicalizeUrl(url) : null,
    platform,
    urlJobId: sourceJobId,
    warnings,
    methodsTried: ["manual_text"],
  });
}

/** Cheap check for the extension preview: is this page a job posting, and what is it? */
export function quickDetect(input: { url: string; html: string }): QuickDetectResult {
  const url = typeof input?.url === "string" ? input.url : "";
  const html = typeof input?.html === "string" ? input.html.slice(0, MAX_HTML) : "";
  const { platform, sourceJobId } = detectPlatform(url);
  const root = parseHtml(html);
  const warnings: string[] = [];
  const pick = (s: SourceExtraction | null) => (s ? sanitizeSource(s, warnings).fields : null);
  const jsonld = pick(fromScan(scanJsonLd(root), validUrl(url))) ?? pick(extractMicrodata(root, validUrl(url)));
  if (jsonld && (jsonld.title || jsonld.description)) {
    return {
      isLikelyJob: true,
      title: jsonld.title ?? null,
      company: jsonld.company ?? null,
      location: jsonld.location ?? null,
      platform,
      confidence: "high",
    };
  }
  const documentTitle = readPageMeta(root).documentTitle;
  const adapter = platform !== "company_site" ? pick(runAdapter(platform, { root, url, documentTitle })) : null;
  const adapterComplete = Boolean(adapter?.title && adapter.description);
  if ((platform !== "company_site" && sourceJobId) || adapterComplete) {
    return {
      isLikelyJob: true,
      title: adapter?.title ?? null,
      company: adapter?.company ?? null,
      location: adapter?.location ?? null,
      platform,
      confidence: "medium",
    };
  }
  // Weak signal: a page with a heading and at least two recognised job-description sections.
  const semantic = pick(extractSemantic(root));
  const sections = segmentSections(semantic?.description ?? "");
  const sectionCount = [sections.responsibilities, sections.requiredQualifications, sections.preferredQualifications, sections.benefits].filter(
    (l) => l.length > 0,
  ).length;
  return {
    isLikelyJob: Boolean(semantic?.title) && sectionCount >= 2,
    title: adapter?.title ?? semantic?.title ?? null,
    company: adapter?.company ?? semantic?.company ?? null,
    location: adapter?.location ?? semantic?.location ?? null,
    platform,
    confidence: "low",
  };
}

function normForHash(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Stable SHA-256 hex of normalized title|company|location|description. */
export function computeContentHash(job: Pick<NormalizedJob, "title" | "company" | "location" | "description">): string {
  return sha256Hex([job.title, job.company, job.location, job.description].map(normForHash).join("|"));
}
