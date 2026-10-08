/**
 * HTML helpers built on node-html-parser. Pure and browser-safe.
 */
import { parse, TextNode, NodeType } from "node-html-parser";
import type { HTMLElement, Node } from "node-html-parser";

export type { HTMLElement } from "node-html-parser";

const PARSE_OPTIONS = {
  lowerCaseTagName: true,
  comment: false,
  // Keep script/style contents as raw text (needed for JSON-LD).
  blockTextElements: { script: true, noscript: true, style: true, pre: true },
};

/** Parse an HTML document or fragment. Never throws. */
export function parseHtml(html: string): HTMLElement {
  try {
    return parse(typeof html === "string" ? html : "", PARSE_OPTIONS);
  } catch {
    return parse("");
  }
}

/** Elements whose content is never part of readable job text. */
const NOISE_TAGS = new Set([
  "script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe",
  "template", "button", "select", "canvas", "object", "embed", "head", "title", "meta", "link",
]);

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "aside", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "blockquote", "pre",
  "figure", "figcaption", "address", "hr", "details", "summary", "center", "body", "html",
  "caption", "fieldset", "legend",
]);

export function tagOf(el: HTMLElement): string {
  return el.rawTagName ? el.rawTagName.toLowerCase() : "";
}

function isHidden(el: HTMLElement): boolean {
  if (el.getAttribute("hidden") !== undefined) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const style = el.getAttribute("style");
  if (style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return true;
  return false;
}

interface WalkOptions {
  /** Tags to skip entirely. */
  skip: Set<string>;
}

function walk(node: Node, out: string[], opts: WalkOptions, inPre: boolean): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = (node as TextNode).text;
    out.push(inPre ? text : text.replace(/\s+/g, " "));
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = tagOf(el);
  if (tag && (opts.skip.has(tag) || isHidden(el))) return;
  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (tag === "li") {
    out.push("\n• ");
    for (const c of el.childNodes) walk(c, out, opts, inPre);
    return;
  }
  if (tag === "td" || tag === "th") {
    out.push(" ");
    for (const c of el.childNodes) walk(c, out, opts, inPre);
    out.push(" ");
    return;
  }
  const block = BLOCK_TAGS.has(tag);
  if (block) out.push("\n");
  for (const c of el.childNodes) walk(c, out, opts, inPre || tag === "pre");
  if (block) out.push("\n");
}

const BULLET_DUP = /^•\s*[•\-*·▪◦●]\s*/;

/** Normalize multi-line text: trim lines, collapse inner whitespace, at most one blank line in a row. */
export function normalizeMultiline(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let blank = 0;
  let pendingBullet = false;
  for (const raw of lines) {
    let line = raw.replace(/[\s  -​  　﻿]+/g, " ").trim();
    line = line.replace(BULLET_DUP, "• ");
    if (line === "•") {
      // A list item whose content starts with a block element: attach the bullet to that content.
      pendingBullet = true;
      continue;
    }
    if (pendingBullet && line) {
      line = line.startsWith("• ") ? line : `• ${line}`;
      pendingBullet = false;
    }
    if (!line) {
      pendingBullet = false;
      blank++;
      if (blank === 1 && out.length > 0) out.push("");
      continue;
    }
    blank = 0;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** Collapse all whitespace (including newlines) to single spaces. */
export function collapseWhitespace(text: string): string {
  return text.replace(/[\s  -​  　﻿]+/g, " ").trim();
}

/** Readable multi-line text of an element, with block structure preserved and noise removed. */
export function elementText(el: HTMLElement, extraSkip: string[] = []): string {
  const skip = extraSkip.length ? new Set([...NOISE_TAGS, ...extraSkip]) : NOISE_TAGS;
  const out: string[] = [];
  walk(el, out, { skip }, false);
  return normalizeMultiline(out.join(""));
}

/** Single-line text of an element (for titles, names, locations). Does not skip header/nav. */
export function inlineText(el: HTMLElement): string {
  const out: string[] = [];
  walk(el, out, { skip: INLINE_SKIP }, false);
  return collapseWhitespace(out.join(" "));
}
const INLINE_SKIP = new Set(["script", "style", "noscript", "svg", "template", "button", "select"]);

/** Decode HTML entities in a plain string. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return new TextNode(text).text;
}

const TAG_RE = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i;
const ESCAPED_TAG_RE = /&(?:amp;)*lt;\s*\/?[a-z]/i;

/**
 * Convert HTML (possibly entity-escaped, as JSON-LD descriptions often are) into readable text.
 * Plain text passes through with whitespace normalized.
 */
export function htmlToText(html: string | null | undefined): string {
  if (typeof html !== "string" || !html.trim()) return "";
  let s = html;
  // Unescape up to twice for "&lt;p&gt;" or "&amp;lt;p&amp;gt;" style content.
  for (let i = 0; i < 2 && !TAG_RE.test(s) && ESCAPED_TAG_RE.test(s); i++) {
    s = decodeEntities(s);
  }
  if (TAG_RE.test(s)) {
    return elementText(parseHtml(s));
  }
  return normalizeMultiline(decodeEntities(s));
}

/** querySelector that tolerates selector syntax the engine does not support. */
export function safeQuery(root: HTMLElement, selector: string): HTMLElement | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

export function safeQueryAll(root: HTMLElement, selector: string): HTMLElement[] {
  try {
    return root.querySelectorAll(selector);
  } catch {
    return [];
  }
}

/** First element matching any selector (in order). */
export function queryFirst(root: HTMLElement, selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = safeQuery(root, sel);
    if (el) return el;
  }
  return null;
}

/** Inline text of the first matching element with non-empty text. */
export function textOf(root: HTMLElement, selectors: readonly string[]): string | null {
  for (const sel of selectors) {
    for (const el of safeQueryAll(root, sel)) {
      const t = inlineText(el);
      if (t) return t;
    }
  }
  return null;
}

/** Multi-line text of the first matching element with non-empty text. */
export function blockTextOf(root: HTMLElement, selectors: readonly string[]): string | null {
  for (const sel of selectors) {
    for (const el of safeQueryAll(root, sel)) {
      const t = elementText(el);
      if (t) return t;
    }
  }
  return null;
}

export function attrOf(root: HTMLElement, selector: string, attr: string): string | null {
  const el = safeQuery(root, selector);
  const v = el?.getAttribute(attr);
  return v && v.trim() ? decodeEntities(v.trim()) : null;
}
