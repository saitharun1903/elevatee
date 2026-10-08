/**
 * schema.org JobPosting extraction from JSON-LD and microdata.
 */
import type { EducationLevel, EducationRequirement, ExperienceRequirement, SalaryRange } from "../schemas/job";
import { EDUCATION_ORDINAL } from "../schemas/job";
import { hostOf, isJobBoardHost, resolveHttpUrl } from "./canonical";
import { countryFromLocation, toCountryCode } from "./countries";
import { htmlToText, inlineText, safeQueryAll, tagOf } from "./html";
import type { HTMLElement } from "./html";
import {
  asArray,
  currencyCode,
  isRecord,
  mapEmploymentToken,
  mapPeriod,
  num,
  salaryRaw,
  str,
  textToList,
  toIsoDateTime,
} from "./normalize";
import { extractEducation, extractExperience } from "./sections";
import type { PartialJob, SourceExtraction } from "./types";

type Json = Record<string, unknown>;

/** C0 control characters plus U+2028/U+2029 (built from char codes to keep the source ASCII). */
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(0x2028, 0x2029)}]+`, "g");

/** Parse JSON, retrying once after common repairs. Returns undefined when still invalid. */
export function lenientJsonParse(raw: string): unknown {
  let s = raw
    .trim()
    .replace(/^﻿/, "")
    .replace(/^\s*(?:<!--|<!\[CDATA\[)/, "")
    .replace(/(?:-->|\]\]>)\s*$/, "")
    .trim();
  try {
    return JSON.parse(s);
  } catch {
    // fall through to repairs
  }
  s = s
    // Raw control characters (e.g. literal newlines inside strings) are invalid JSON; whitespace is safe.
    .replace(CONTROL_CHARS, " ")
    // Trailing commas.
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/;\s*$/, "");
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function hasType(obj: Json, type: string): boolean {
  return asArray(obj["@type"]).some((t) => typeof t === "string" && t.replace(/^.*[/#:]/, "").toLowerCase() === type.toLowerCase());
}

/** Depth-first search for JobPosting objects through arrays, @graph and nested values. */
function collectPostings(data: unknown, out: Json[], depth = 0): void {
  if (depth > 8 || data === null || data === undefined) return;
  if (Array.isArray(data)) {
    for (const d of data) collectPostings(d, out, depth + 1);
    return;
  }
  if (!isRecord(data)) return;
  if (hasType(data, "JobPosting")) {
    out.push(data);
    return;
  }
  for (const v of Object.values(data)) {
    if (typeof v === "object" && v !== null) collectPostings(v, out, depth + 1);
  }
}

export interface JsonLdScan {
  postings: Json[];
  blocks: number;
  invalidBlocks: number;
}

export function scanJsonLd(root: HTMLElement): JsonLdScan {
  const postings: Json[] = [];
  let blocks = 0;
  let invalidBlocks = 0;
  for (const el of safeQueryAll(root, "script")) {
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if (!type.includes("ld+json")) continue;
    blocks++;
    const parsed = lenientJsonParse(el.rawText);
    if (parsed === undefined) {
      invalidBlocks++;
      continue;
    }
    collectPostings(parsed, postings);
  }
  return { postings, blocks, invalidBlocks };
}

function postingScore(p: Json): number {
  return ["title", "description", "hiringOrganization", "jobLocation", "datePosted", "baseSalary"].filter((k) => p[k]).length;
}

// ---------------------------------------------------------------------------
// Field mappers
// ---------------------------------------------------------------------------

function mapOrganization(v: unknown, baseUrl: string | null): { name: string | null; website: string | null } {
  for (const org of asArray(v)) {
    if (typeof org === "string") {
      const name = str(org);
      if (name) return { name, website: null };
      continue;
    }
    if (!isRecord(org)) continue;
    const name = str(org.name) ?? str(org.legalName);
    let website: string | null = null;
    for (const candidate of [...asArray(org.sameAs), ...asArray(org.url)]) {
      const u = resolveHttpUrl(candidate, baseUrl);
      const h = hostOf(u);
      if (u && h && !isJobBoardHost(h) && !/(?:facebook|twitter|x|instagram|youtube|wikipedia|crunchbase)\.(?:com|org)$/.test(h)) {
        website = u;
        break;
      }
    }
    if (name || website) return { name, website };
  }
  return { name: null, website: null };
}

interface PlaceInfo {
  text: string | null;
  country: string | null;
}

function countryValue(v: unknown): string | null {
  if (typeof v === "string") return str(v);
  if (isRecord(v)) return str(v.name) ?? str(v.identifier) ?? str(v.alternateName);
  return null;
}

function mapPlace(place: unknown): PlaceInfo {
  if (typeof place === "string") {
    const text = str(place);
    return { text, country: countryFromLocation(text) };
  }
  if (!isRecord(place)) return { text: null, country: null };
  const addrs = asArray(place.address ?? (hasType(place, "PostalAddress") ? place : null));
  for (const addr of addrs) {
    if (typeof addr === "string") {
      const text = str(addr);
      if (text) return { text, country: countryFromLocation(text) };
      continue;
    }
    if (!isRecord(addr)) continue;
    const countryRaw = countryValue(addr.addressCountry);
    const parts: string[] = [];
    for (const p of [str(addr.addressLocality), str(addr.addressRegion), countryRaw]) {
      if (p && !parts.some((x) => x.toLowerCase() === p.toLowerCase())) parts.push(p);
    }
    if (parts.length) return { text: parts.join(", "), country: toCountryCode(countryRaw) };
  }
  const name = str(place.name);
  return { text: name, country: countryFromLocation(name) };
}

function mapLocations(v: unknown): PlaceInfo {
  const places = asArray(v).map(mapPlace).filter((p) => p.text);
  if (!places.length) return { text: null, country: null };
  const texts: string[] = [];
  for (const p of places) if (p.text && !texts.includes(p.text)) texts.push(p.text);
  const codes = new Set(places.map((p) => p.country));
  const country = codes.size === 1 ? (places[0]?.country ?? null) : null;
  return { text: texts.join("; ").slice(0, 300), country };
}

function mapApplicantLocations(v: unknown): PlaceInfo {
  const names: string[] = [];
  const codes = new Set<string | null>();
  for (const item of asArray(v)) {
    const name = isRecord(item) ? str(item.name) : str(item);
    if (!name) continue;
    names.push(name);
    codes.add(toCountryCode(name));
  }
  if (!names.length) return { text: null, country: null };
  const only = codes.size === 1 ? [...codes][0] ?? null : null;
  return { text: names.join(", ").slice(0, 300), country: only };
}

function mapSalary(v: unknown): SalaryRange | null {
  for (const ms of asArray(v)) {
    if (typeof ms === "number" || typeof ms === "string") {
      const n = num(ms);
      if (n === null || n === 0) continue;
      return { currency: null, min: n, max: n, period: null, raw: salaryRaw(null, n, n, null), source: "job_posting" };
    }
    if (!isRecord(ms)) continue;
    const currency = currencyCode(ms.currency) ?? currencyCode(ms.salaryCurrency);
    let min: number | null = null;
    let max: number | null = null;
    let period = mapPeriod(ms.unitText);
    for (const value of asArray(ms.value)) {
      if (isRecord(value)) {
        min = num(value.minValue) ?? num(value.value);
        max = num(value.maxValue) ?? num(value.value);
        period = mapPeriod(value.unitText) ?? period;
      } else {
        min = max = num(value);
      }
      if (min !== null || max !== null) break;
    }
    if (min === null && max === null) {
      min = num(ms.minValue);
      max = num(ms.maxValue);
    }
    // Zero is commonly a placeholder for "not disclosed".
    if (min === 0) min = null;
    if (max === 0) max = null;
    if (min === null && max === null) continue;
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    return { currency, min, max, period, raw: salaryRaw(currency, min, max, period), source: "job_posting" };
  }
  return null;
}

function mapExperience(v: unknown): ExperienceRequirement | null {
  for (const item of asArray(v)) {
    if (typeof item === "string") {
      const text = htmlToText(item);
      if (!text) continue;
      return extractExperience(text) ?? { minYears: null, maxYears: null, raw: text.slice(0, 400) };
    }
    if (!isRecord(item)) continue;
    const months = num(item.monthsOfExperience);
    const desc = str(item.description);
    if (months !== null && months <= 720) {
      const years = Math.round((months / 12) * 10) / 10;
      return { minYears: years, maxYears: null, raw: (desc ?? `${months} months of experience`).slice(0, 400) };
    }
    if (desc) return extractExperience(desc) ?? { minYears: null, maxYears: null, raw: desc.slice(0, 400) };
  }
  return null;
}

function mapCredentialCategory(v: string): EducationLevel | null {
  const s = v.toLowerCase();
  if (/no requirements?|none required/.test(s)) return "none";
  if (/doctor|ph\.?d/.test(s)) return "doctorate";
  if (/post ?graduate|master/.test(s)) return "master";
  if (/bachelor/.test(s)) return "bachelor";
  if (/associate/.test(s)) return "associate";
  if (/professional certificate|certificate|vocational/.test(s)) return "vocational";
  if (/high ?school|secondary/.test(s)) return "secondary";
  return null;
}

function mapEducation(v: unknown): EducationRequirement | null {
  let best: EducationRequirement | null = null;
  const consider = (e: EducationRequirement | null) => {
    if (!e) return;
    if (!best) best = e;
    else if (e.minLevel && (!best.minLevel || EDUCATION_ORDINAL[e.minLevel] < EDUCATION_ORDINAL[best.minLevel])) best = e;
  };
  for (const item of asArray(v)) {
    if (typeof item === "string") {
      const text = htmlToText(item);
      if (!text) continue;
      const level = mapCredentialCategory(text);
      const parsed = extractEducation(text);
      consider(parsed ?? { minLevel: level, fields: [], required: null, raw: text.slice(0, 400) });
      continue;
    }
    if (!isRecord(item)) continue;
    const category = str(item.credentialCategory);
    const desc = str(item.description) ?? str(item.name);
    const level = category ? mapCredentialCategory(category) : null;
    const parsed = desc ? extractEducation(desc) : null;
    const raw = (desc ?? category)?.slice(0, 400) ?? null;
    if (!level && !parsed && !raw) continue;
    consider({
      minLevel: level ?? parsed?.minLevel ?? null,
      fields: parsed?.fields ?? [],
      required: parsed?.required ?? null,
      raw,
    });
  }
  return best;
}

function mapList(v: unknown): string[] {
  const out: string[] = [];
  for (const item of asArray(v)) {
    const text = typeof item === "string" ? htmlToText(item) : str(item);
    if (text) out.push(...textToList(text));
  }
  return out;
}

function mapIdentifier(v: unknown): string | null {
  for (const id of asArray(v)) {
    const s = isRecord(id) ? str(id.value) ?? str(id["@id"]) : str(id);
    if (s && s.length <= 200) return s;
  }
  return null;
}

/** Map a schema.org JobPosting object (from JSON-LD or microdata) to job fields. */
export function mapJobPosting(p: Json, baseUrl: string | null): PartialJob {
  const fields: PartialJob = {};
  fields.title = str(p.title) ?? str(p.name);
  const org = mapOrganization(p.hiringOrganization, baseUrl);
  fields.company = org.name;
  fields.companyWebsite = org.website;

  const loc = mapLocations(p.jobLocation);
  const applicant = mapApplicantLocations(p.applicantLocationRequirements);
  fields.location = loc.text ?? applicant.text;
  fields.country = loc.country ?? (loc.text ? null : applicant.country);
  const locationTypes = asArray(p.jobLocationType).map((t) => str(t)?.toUpperCase());
  if (locationTypes.includes("TELECOMMUTE")) fields.workplaceType = "remote";

  fields.employmentType = mapEmploymentToken(p.employmentType);
  fields.postedAt = toIsoDateTime(p.datePosted);
  fields.validThrough = toIsoDateTime(p.validThrough);
  const description = typeof p.description === "string" ? htmlToText(p.description) : null;
  fields.description = description || null;
  fields.salary = mapSalary(p.baseSalary);
  fields.sourceJobId = mapIdentifier(p.identifier);

  const url = resolveHttpUrl(str(p.url), baseUrl);
  if (url) fields.applicationUrl = url;

  fields.experience = mapExperience(p.experienceRequirements);
  fields.education = mapEducation(p.educationRequirements);
  fields.responsibilities = mapList(p.responsibilities);
  // schema.org has no required/preferred split; qualifications and skills are listed as stated.
  fields.requiredQualifications = [...mapList(p.qualifications), ...mapList(p.skills)];
  fields.benefits = mapList(p.jobBenefits);
  return fields;
}

/** Extract the best JobPosting found in JSON-LD. */
export function extractJsonLd(root: HTMLElement, baseUrl: string | null): SourceExtraction | null {
  const scan = scanJsonLd(root);
  return fromScan(scan, baseUrl);
}

export function fromScan(scan: JsonLdScan, baseUrl: string | null): SourceExtraction | null {
  if (!scan.postings.length) return null;
  const best = [...scan.postings].sort((a, b) => postingScore(b) - postingScore(a))[0] as Json;
  const warnings: string[] = [];
  if (scan.postings.length > 1) warnings.push(`Found ${scan.postings.length} JobPosting objects; used the most complete one`);
  return { method: "json_ld", fields: mapJobPosting(best, baseUrl), warnings };
}

// ---------------------------------------------------------------------------
// Microdata
// ---------------------------------------------------------------------------

function microdataValue(el: HTMLElement, prop: string): unknown {
  if (el.getAttribute("itemscope") !== undefined) return readItem(el);
  const tag = tagOf(el);
  const content = el.getAttribute("content");
  if (content !== undefined) return content;
  if (tag === "meta") return el.getAttribute("content") ?? null;
  if ((tag === "a" || tag === "link" || tag === "area") && el.getAttribute("href")) return el.getAttribute("href");
  if ((tag === "img" || tag === "source") && el.getAttribute("src")) return el.getAttribute("src");
  if (tag === "time" && el.getAttribute("datetime")) return el.getAttribute("datetime");
  if (tag === "data" || tag === "meter") return el.getAttribute("value") ?? inlineText(el);
  // Descriptions and list-like props keep their HTML so structure survives htmlToText.
  if (/^(?:description|qualifications|responsibilities|skills|jobBenefits|experienceRequirements|educationRequirements)$/.test(prop)) {
    return el.innerHTML;
  }
  return inlineText(el);
}

function addProp(obj: Json, key: string, value: unknown): void {
  if (value === null || value === undefined || value === "") return;
  const existing = obj[key];
  if (existing === undefined) obj[key] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else obj[key] = [existing, value];
}

function collectProps(el: HTMLElement, obj: Json): void {
  for (const child of el.childNodes) {
    if (child.nodeType !== 1) continue;
    const c = child as HTMLElement;
    const props = (c.getAttribute("itemprop") ?? "").split(/\s+/).filter(Boolean);
    for (const prop of props) addProp(obj, prop, microdataValue(c, prop));
    // A nested itemscope owns its own descendants.
    if (c.getAttribute("itemscope") === undefined) collectProps(c, obj);
  }
}

function readItem(el: HTMLElement): Json {
  const obj: Json = {};
  const type = el.getAttribute("itemtype");
  if (type) obj["@type"] = type.split(/\s+/).map((t) => t.replace(/^.*[/#]/, ""));
  collectProps(el, obj);
  return obj;
}

/** Extract a JobPosting expressed as schema.org microdata. */
export function extractMicrodata(root: HTMLElement, baseUrl: string | null): SourceExtraction | null {
  const scopes = safeQueryAll(root, "[itemtype]").filter((el) => /schema\.org\/JobPosting/i.test(el.getAttribute("itemtype") ?? ""));
  const first = scopes[0];
  if (!first) return null;
  const item = readItem(first);
  const fields = mapJobPosting(item, baseUrl);
  if (!fields.title && !fields.description) return null;
  return { method: "microdata", fields, warnings: [] };
}
