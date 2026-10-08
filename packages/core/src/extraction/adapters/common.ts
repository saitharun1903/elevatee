/**
 * Shared helpers for platform DOM adapters. Every selector is optional: DOMs change often,
 * so adapters only report what they can actually find.
 */
import { blockTextOf, collapseWhitespace, inlineText, queryFirst, safeQuery, safeQueryAll, textOf } from "../html";
import type { HTMLElement } from "../html";
import { mapEmploymentToken, mapWorkplaceToken } from "../normalize";
import { classifyHeading, extractEmploymentType, extractSalaryFromText } from "../sections";
import type { PartialJob, SourceExtraction } from "../types";

export interface AdapterContext {
  root: HTMLElement;
  url: string;
  /** document.title (from <title> or the caller). */
  documentTitle: string | null;
}

export type Adapter = (ctx: AdapterContext) => SourceExtraction | null;

export interface SelectorSpec {
  title?: string[];
  company?: string[];
  location?: string[];
  description?: string[];
  salary?: string[];
  employment?: string[];
  workplace?: string[];
  jobId?: string[];
}

/** Remove a leading field label such as "locations", "Location:", "time type". */
export function stripLabel(text: string, labels: RegExp): string {
  return collapseWhitespace(text.replace(labels, ""));
}

/** Text of a labelled block: prefers <dd>, else the element text minus its <dt>/label. */
export function labelledValue(root: HTMLElement, selectors: string[], label?: RegExp): string | null {
  const el = queryFirst(root, selectors);
  if (!el) return null;
  const dd = safeQuery(el, "dd");
  const text = dd ? inlineText(dd) : inlineText(el);
  const value = label ? stripLabel(text, label) : text;
  return value || null;
}

/** Remove trailing "4.1 ★" / "4.1 out of 5 stars" rating noise from employer names. */
export function cleanCompanyName(name: string | null): string | null {
  if (!name) return null;
  const v = collapseWhitespace(name)
    .replace(/\s*\d(?:[.,]\d)?\s*(?:out of 5 stars?|★|stars?)[\s\S]*$/i, "")
    .replace(/\s*\d(?:\.\d)\s*$/, "")
    .replace(/^at\s+/i, "")
    .trim();
  return v || null;
}

export function fromSelectors(root: HTMLElement, spec: SelectorSpec): PartialJob {
  const f: PartialJob = {};
  if (spec.title) f.title = textOf(root, spec.title);
  if (spec.company) f.company = cleanCompanyName(textOf(root, spec.company));
  if (spec.location) f.location = textOf(root, spec.location);
  if (spec.description) f.description = blockTextOf(root, spec.description);
  if (spec.salary) {
    const salaryText = blockTextOf(root, spec.salary);
    if (salaryText) {
      f.salary = extractSalaryFromText(salaryText);
      f.employmentType = extractEmploymentType(salaryText);
    }
  }
  if (spec.employment) {
    const t = textOf(root, spec.employment);
    f.employmentType = mapEmploymentToken(t) ?? extractEmploymentType(t) ?? f.employmentType ?? null;
  }
  if (spec.workplace) f.workplaceType = mapWorkplaceToken(textOf(root, spec.workplace));
  if (spec.jobId) f.sourceJobId = textOf(root, spec.jobId);
  return f;
}

/** Collect lists that sit under recognised h2/h3/h4/strong headings inside a container. */
export function listsUnderHeadings(container: HTMLElement): Pick<PartialJob, "responsibilities" | "requiredQualifications" | "preferredQualifications" | "benefits"> {
  const out = { responsibilities: [] as string[], requiredQualifications: [] as string[], preferredQualifications: [] as string[], benefits: [] as string[] };
  for (const heading of safeQueryAll(container, "h2, h3, h4, h5, strong, b")) {
    const kind = classifyHeading(inlineText(heading));
    if (!kind || kind === "other") continue;
    // The list is the next <ul>/<ol> sibling of the heading (or of its parent block).
    let list: HTMLElement | null = null;
    let depth = 0;
    for (let node: HTMLElement | null = heading; node && !list && depth < 3; node = node.parentNode, depth++) {
      let sib = node.nextElementSibling;
      while (sib && !list) {
        const tag = sib.rawTagName?.toLowerCase();
        if (tag === "ul" || tag === "ol") list = sib;
        else if (/^h[1-6]$/.test(tag ?? "") || safeQuery(sib, "h2, h3, h4")) break;
        else list = safeQuery(sib, "ul, ol");
        sib = sib.nextElementSibling;
      }
      if (node === container) break;
    }
    if (!list) continue;
    const items = safeQueryAll(list, "li").map((li) => inlineText(li)).filter(Boolean);
    const bucket =
      kind === "responsibilities"
        ? out.responsibilities
        : kind === "required"
          ? out.requiredQualifications
          : kind === "preferred"
            ? out.preferredQualifications
            : out.benefits;
    for (const item of items) if (!bucket.includes(item)) bucket.push(item);
  }
  return out;
}

export function hasContent(f: PartialJob): boolean {
  return Boolean(f.title || f.description);
}

export function result(fields: PartialJob, warnings: string[] = []): SourceExtraction | null {
  return hasContent(fields) ? { method: "platform_dom", fields, warnings } : null;
}
