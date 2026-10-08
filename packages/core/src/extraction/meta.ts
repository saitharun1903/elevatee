/**
 * OpenGraph / Twitter / <meta> / <title> fallback. Lowest priority source.
 */
import { hostOf, isJobBoardHost, isJobBoardName } from "./canonical";
import { collapseWhitespace, decodeEntities, safeQuery, safeQueryAll } from "./html";
import type { HTMLElement } from "./html";
import type { SourceExtraction } from "./types";

export interface PageMeta {
  title: string | null;
  description: string | null;
  siteName: string | null;
  documentTitle: string | null;
}

function metaContent(root: HTMLElement, keys: string[]): string | null {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  for (const el of safeQueryAll(root, "meta")) {
    const key = (el.getAttribute("property") ?? el.getAttribute("name") ?? el.getAttribute("itemprop") ?? "").toLowerCase();
    if (!wanted.has(key)) continue;
    const content = el.getAttribute("content");
    if (content && content.trim()) return collapseWhitespace(decodeEntities(content));
  }
  return null;
}

export function readPageMeta(root: HTMLElement, fallbackTitle?: string): PageMeta {
  const titleEl = safeQuery(root, "title");
  const documentTitle = (titleEl ? collapseWhitespace(decodeEntities(titleEl.rawText)) : "") || (fallbackTitle ? collapseWhitespace(fallbackTitle) : "") || null;
  return {
    title: metaContent(root, ["og:title", "twitter:title"]),
    description: metaContent(root, ["og:description", "twitter:description", "description"]),
    siteName: metaContent(root, ["og:site_name", "application-name"]),
    documentTitle,
  };
}

/** Remove a trailing " | LinkedIn" / " - Indeed.com" style job-board suffix from a page title. */
export function stripBoardSuffix(title: string): string {
  const parts = title.split(/\s+[|–—-]\s+/);
  while (parts.length > 1 && isJobBoardName(parts[parts.length - 1])) parts.pop();
  return parts.join(" - ").trim();
}

/** Meta-based fallback. Never uses og:site_name as the employer on job-board hosts. */
export function extractMeta(root: HTMLElement, url: string, fallbackTitle?: string): SourceExtraction | null {
  const meta = readPageMeta(root, fallbackTitle);
  const warnings: string[] = [];
  const rawTitle = meta.title ?? meta.documentTitle;
  const title = rawTitle ? stripBoardSuffix(rawTitle) || null : null;
  const host = hostOf(url);
  let company: string | null = null;
  if (meta.siteName && host && !isJobBoardHost(host) && !isJobBoardName(meta.siteName)) {
    company = employerFromSiteName(meta.siteName);
  }
  if (!title && !meta.description && !company) return null;
  return {
    method: "meta",
    fields: { title, description: meta.description, company },
    warnings,
  };
}

/**
 * Career sites often name themselves "Careers at X", "X Careers" or "X | Jobs".
 * Strip that wrapper so the employer name is what remains; null if nothing sensible is left.
 */
export function employerFromSiteName(siteName: string): string | null {
  const cleaned = siteName
    .replace(/^\s*(careers?|jobs?|work|life|join us)\s+(at|@|with)\s+/i, "")
    .replace(/\s*[|\-–—:]\s*(careers?|jobs?|career site|job board|recruiting|recruitment|work with us|join us)\s*$/i, "")
    .replace(/\s+(careers?|jobs?|career site|recruiting|recruitment)\s*$/i, "")
    .trim();
  if (/^(careers?|jobs?|career site|job board|recruiting|recruitment|join us)$/i.test(cleaned)) return null;
  return cleaned.length >= 2 && cleaned.length <= 120 ? cleaned : null;
}
