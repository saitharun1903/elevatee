/**
 * Small value normalizers shared by all extraction sources.
 */
import type { EmploymentType, SalaryRange, WorkplaceType } from "../schemas/job";
import { collapseWhitespace, decodeEntities } from "./html";
import { stripBullet } from "./sections";

export function asArray<T = unknown>(v: T | T[] | null | undefined): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Single-line string from a scalar (or schema.org {"@value"} / {name}), entities decoded. */
export function str(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const t = collapseWhitespace(decodeEntities(v));
    return t || null;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = str(x);
      if (s) return s;
    }
    return null;
  }
  if (isRecord(v)) {
    if ("@value" in v) return str(v["@value"]);
    if ("name" in v) return str(v.name);
  }
  return null;
}

/** Number from number or numeric string ("85,000", "85000.00"). */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[\s,]/g, "").replace(/[^\d.]/g, "");
    if (!cleaned || !/\d/.test(cleaned)) return null;
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (isRecord(v) && "@value" in v) return num(v["@value"]);
  return null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * ISO-8601 datetime with offset. Date-only values become midnight UTC. Datetimes without
 * an offset are read as UTC (never as the local machine's zone, which would be arbitrary).
 * Non-ISO strings return null rather than being guessed.
 */
export function toIsoDateTime(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let candidate: string | null = null;
  const d = ISO_DATE.exec(s);
  if (d) candidate = `${s}T00:00:00Z`;
  const dt = ISO_DATETIME.exec(s);
  if (dt) {
    let offset = dt[7] ?? "Z";
    if (/^[+-]\d{4}$/.test(offset)) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
    candidate = `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6] ?? "00"}${offset.toUpperCase()}`;
  }
  if (!candidate) return null;
  const t = Date.parse(candidate);
  if (!Number.isFinite(t)) return null;
  const year = new Date(t).getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return new Date(t).toISOString();
}

const EMPLOYMENT_TOKENS: Record<string, EmploymentType> = {
  full_time: "full_time", fulltime: "full_time", "full time": "full_time", "full-time": "full_time",
  part_time: "part_time", parttime: "part_time", "part time": "part_time", "part-time": "part_time",
  contractor: "contract", contract: "contract", contractual: "contract", freelance: "contract",
  "fixed term": "contract", "fixed-term": "contract", "contract to hire": "contract",
  temporary: "temporary", temp: "temporary", seasonal: "temporary",
  intern: "internship", internship: "internship",
  apprenticeship: "apprenticeship", apprentice: "apprenticeship",
  volunteer: "volunteer", per_diem: "per_diem", "per diem": "per_diem", prn: "per_diem",
  other: "other",
};

/** Map a structured employment-type token ("FULL_TIME", "Full-time", "Contractor"). */
export function mapEmploymentToken(v: unknown): EmploymentType | null {
  for (const item of asArray(v)) {
    const s = str(item);
    if (!s) continue;
    for (const part of s.split(/[,/|;]/)) {
      const key = part.trim().toLowerCase().replace(/\s+/g, " ");
      const mapped = EMPLOYMENT_TOKENS[key] ?? EMPLOYMENT_TOKENS[key.replace(/[\s-]/g, "_")];
      if (mapped) return mapped;
    }
  }
  return null;
}

/** Map a workplace token ("Remote", "Hybrid", "On-site", "In office"). */
export function mapWorkplaceToken(v: unknown): WorkplaceType | null {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (/\bhybrid\b/.test(s)) return "hybrid";
  if (/\bremote\b|\btelecommute\b|work from home/.test(s)) return "remote";
  if (/\bon[- ]?site\b|\bin[- ]office\b|\bonsite\b|\bin[- ]person\b/.test(s)) return "onsite";
  return null;
}

const PERIODS: Record<string, SalaryRange["period"]> = {
  hour: "hour", hourly: "hour", hr: "hour", per_hour: "hour",
  day: "day", daily: "day", per_day: "day",
  week: "week", weekly: "week", per_week: "week",
  month: "month", monthly: "month", per_month: "month",
  year: "year", yearly: "year", annual: "year", annually: "year", annum: "year", per_year: "year",
};

export function mapPeriod(v: unknown): SalaryRange["period"] {
  const s = str(v)?.toLowerCase().replace(/^per\s+/, "").replace(/\s+/g, "_");
  if (!s) return null;
  return PERIODS[s] ?? PERIODS[s.replace(/^per_/, "")] ?? null;
}

function formatAmount(n: number): string {
  const [int, dec] = String(Math.round(n * 100) / 100).split(".");
  const grouped = (int ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${grouped}.${dec}` : grouped;
}

/** Human-readable salary text built only from the values given. */
export function salaryRaw(currency: string | null, min: number | null, max: number | null, period: SalaryRange["period"]): string {
  let amount: string;
  if (min !== null && max !== null && min !== max) amount = `${formatAmount(min)}–${formatAmount(max)}`;
  else if (min !== null) amount = formatAmount(min);
  else if (max !== null) amount = `up to ${formatAmount(max)}`;
  else amount = "";
  return [currency, amount, period ? `per ${period}` : null].filter(Boolean).join(" ").trim();
}

/** Turn a text block (or array of blocks) into a list of items, one per line / bullet. */
export function textToList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const item = stripBullet(t) ?? t;
    if (item) out.push(item);
  }
  return out;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;
export function currencyCode(v: unknown): string | null {
  const s = str(v)?.toUpperCase();
  return s && CURRENCY_CODE.test(s) ? s : null;
}
