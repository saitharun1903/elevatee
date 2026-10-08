import type { SalaryRange } from "@elevate/core";

/** Locale-aware formatting. Nothing defaults to a currency or time zone. */

export function formatDate(iso: string | null | undefined, locale = "en", opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }, timeZone?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { ...opts, ...(timeZone ? { timeZone } : {}) }).format(d);
}

export function formatDateTime(iso: string, locale = "en", timeZone?: string | null) {
  return formatDate(iso, locale, { dateStyle: "medium", timeStyle: "short" }, timeZone);
}

export function relativeTime(iso: string | null | undefined, locale = "en", now = Date.now()) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(0, "minute");
}

export function formatSalary(s: SalaryRange | null, locale = "en"): string | null {
  if (!s || (s.min === null && s.max === null)) return s?.raw ?? null;
  const fmt = (n: number) =>
    s.currency
      ? new Intl.NumberFormat(locale, { style: "currency", currency: s.currency, maximumFractionDigits: 0 }).format(n)
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  const range = s.min !== null && s.max !== null && s.min !== s.max ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt((s.min ?? s.max)!);
  const per = s.period ? ` / ${s.period}` : "";
  return `${range}${per}${s.currency ? "" : " (currency not stated)"}`;
}

export function humanize(s: string | null | undefined) {
  if (!s) return null;
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
