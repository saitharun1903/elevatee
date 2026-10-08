/**
 * Generic DOM fallback for pages without structured data or a known platform adapter.
 */
import { collapseWhitespace, elementText, inlineText, queryFirst, safeQuery, safeQueryAll, tagOf } from "./html";
import type { HTMLElement } from "./html";
import { mapEmploymentToken, mapWorkplaceToken, toIsoDateTime } from "./normalize";
import { extractEmploymentType, extractSalaryFromText, extractWorkplaceType } from "./sections";
import type { PartialJob, SourceExtraction } from "./types";

const CONTENT_HINT = /(?:job|description|posting|vacancy|vacancies|position|opening|career|role)/i;
const CONTENT_EXCLUDE = /(?:list|search|related|similar|recommend|nav|menu|footer|header|sidebar|card|alert|banner|share|cookie|modal|breadcrumb|filter|pagination|apply-?button|logo)/i;
const DESCRIPTION_HINT = /(?:description|job-?details?|posting-?(?:body|content)|job-?(?:body|content)|vacancy-?(?:details|content)|position-?details)/i;

/** Pick the element most likely to hold the job content. */
export function findMainContent(root: HTMLElement): HTMLElement {
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const el of safeQueryAll(root, "[id], [class]")) {
    const sig = `${el.id} ${el.classNames}`;
    if (!DESCRIPTION_HINT.test(sig) || CONTENT_EXCLUDE.test(sig)) continue;
    const len = elementText(el).length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  if (best && bestLen >= 200) return best;
  const landmark = queryFirst(root, ["main", "article", '[role="main"]']);
  if (landmark && elementText(landmark).length >= 100) return landmark;
  for (const el of safeQueryAll(root, "[id], [class]")) {
    const sig = `${el.id} ${el.classNames}`;
    if (!CONTENT_HINT.test(sig) || CONTENT_EXCLUDE.test(sig)) continue;
    const len = elementText(el).length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  if (best && bestLen >= 200) return best;
  return safeQuery(root, "body") ?? root;
}

type LabelKind = "company" | "location" | "title" | "salary" | "employment" | "workplace" | "posted" | "closing" | "reference";

const LABELS: Array<[LabelKind, RegExp]> = [
  ["company", /^(?:company|employer|organi[sz]ation|hiring (?:company|organi[sz]ation)|company name|employer name|recruiting organi[sz]ation)$/],
  ["location", /^(?:location|job location|work location|based in|city|office location|place of work|duty station|work site)$/],
  ["title", /^(?:job title|position|position title|role|vacancy|post title|job)$/],
  ["salary", /^(?:salary|pay|compensation|remuneration|salary range|pay range|pay scale|wage|stipend|ctc|annual salary|hourly rate)$/],
  ["workplace", /^(?:workplace|workplace type|work model|work arrangement|work mode|remote|remote work|on-?site\/remote)$/],
  ["employment", /^(?:job type|employment type|contract type|type of contract|contract|employment|work type|hours|working pattern|type)$/],
  ["posted", /^(?:posted|date posted|posted on|publication date|published)$/],
  ["closing", /^(?:closing date|apply by|deadline|application deadline|valid through|closes)$/],
  ["reference", /^(?:job id|job reference|reference|ref|reference number|requisition id|req id|vacancy reference|job code|job number)$/],
];

function labelKind(label: string): LabelKind | null {
  const key = collapseWhitespace(label).replace(/[:：]\s*$/, "").toLowerCase();
  if (!key || key.length > 40) return null;
  for (const [kind, re] of LABELS) if (re.test(key)) return kind;
  return null;
}

/** Label/value pairs from <dl>, two-cell table rows, and "Label: value" lines. */
export function labelledPairs(root: HTMLElement): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const dt of safeQueryAll(root, "dt")) {
    const dd = dt.nextElementSibling;
    if (dd && tagOf(dd) === "dd") pairs.push([inlineText(dt), inlineText(dd)]);
  }
  for (const tr of safeQueryAll(root, "tr")) {
    const cells = tr.childNodes.filter((c): c is HTMLElement => c.nodeType === 1 && /^t[hd]$/.test(tagOf(c as HTMLElement)));
    if (cells.length === 2) pairs.push([inlineText(cells[0] as HTMLElement), inlineText(cells[1] as HTMLElement)]);
  }
  const body = safeQuery(root, "body") ?? root;
  pairs.push(...pairsFromText(elementText(body)));
  return pairs;
}

/** "Label: value" pairs from plain text lines. */
export function pairsFromText(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const line of text.split("\n")) {
    const m = /^(?:•\s*)?([A-Za-z][A-Za-z /&-]{1,38})\s*[:：]\s*(.{1,200})$/.exec(line.trim());
    if (m) pairs.push([m[1] ?? "", m[2] ?? ""]);
  }
  return pairs;
}

export function fieldsFromLabels(root: HTMLElement): PartialJob {
  return fieldsFromPairs(labelledPairs(root));
}

/** Map recognised label/value pairs to job fields (first occurrence wins). */
export function fieldsFromPairs(pairs: Array<[string, string]>): PartialJob {
  const f: PartialJob = {};
  for (const [label, rawValue] of pairs) {
    const kind = labelKind(label);
    const value = collapseWhitespace(rawValue);
    if (!kind || !value) continue;
    switch (kind) {
      case "company":
        f.company ??= value;
        break;
      case "location":
        f.location ??= value;
        break;
      case "title":
        f.title ??= value;
        break;
      case "salary":
        f.salary ??= extractSalaryFromText(`Salary: ${value}`);
        break;
      case "workplace":
        f.workplaceType ??= mapWorkplaceToken(value) ?? extractWorkplaceType(value);
        break;
      case "employment":
        f.employmentType ??= mapEmploymentToken(value) ?? extractEmploymentType(value);
        if (!f.workplaceType) f.workplaceType = mapWorkplaceToken(value);
        break;
      case "posted":
        f.postedAt ??= toIsoDateTime(value);
        break;
      case "closing":
        f.validThrough ??= toIsoDateTime(value);
        break;
      case "reference":
        if (/^[\w.:-]{1,200}$/.test(value)) f.sourceJobId ??= value;
        break;
    }
  }
  return f;
}

/** Generic semantic extraction: main content, h1 title, labelled fields. */
export function extractSemantic(root: HTMLElement): SourceExtraction | null {
  const main = findMainContent(root);
  const labelled = fieldsFromLabels(root);
  const h1 = safeQuery(main, "h1") ?? safeQuery(root, "h1");
  const h1Text = h1 ? inlineText(h1) : "";
  const title = h1Text && h1Text.length <= 200 ? h1Text : labelled.title ?? null;
  const description = elementText(main) || null;
  const fields: PartialJob = { ...labelled, title, description };
  if (!fields.title && !fields.description) return null;
  return { method: "semantic_dom", fields, warnings: [] };
}
