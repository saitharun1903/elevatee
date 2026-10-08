/**
 * Page capture.
 *
 * `capturePage` is injected into the job page with chrome.scripting.executeScript, which
 * serializes the function source. It must therefore be completely self-contained: no imports,
 * no references to module scope, no helpers outside its body. It only runs after an explicit
 * user click (activeTab grant), never automatically.
 *
 * The same function is unit-tested by passing a Document in.
 */

export const MAX_HTML_CHARS = 2_500_000;
export const MAX_SELECTION_CHARS = 60_000;

export interface RawCapture {
  url: string;
  title: string;
  selectionText?: string;
  html: string;
  truncated: boolean;
}

export function capturePage(doc?: Document): RawCapture {
  const d: Document = doc ?? document;
  const MAX_HTML = 2_500_000;
  const MAX_SELECTION = 60_000;

  const root = d.documentElement.cloneNode(true) as HTMLElement;

  // Scripts: keep only structured data (JSON-LD JobPosting is the most reliable job source).
  const scripts = Array.from(root.querySelectorAll("script"));
  for (const s of scripts) {
    const type = (s.getAttribute("type") || "").trim().toLowerCase();
    if (type !== "application/ld+json") s.remove();
  }
  // Heavy or non-content elements, and form fields (they can hold values the user typed or tokens).
  const drop = "style,noscript,svg,iframe,img,video,audio,picture,canvas,object,embed,template,input,textarea,select";
  for (const el of Array.from(root.querySelectorAll(drop))) el.remove();
  // <link> elements: keep only rel=canonical (helps de-duplication); drop stylesheets, preloads, etc.
  for (const el of Array.from(root.querySelectorAll("link"))) {
    const rel = (el.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    if (!rel.includes("canonical")) el.remove();
  }
  // Inline styles and event handlers carry no job content.
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n === "style" || n.startsWith("on")) el.removeAttribute(attr.name);
    }
  }
  // Comments.
  const walker = d.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments: Node[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) comments.push(n);
  for (const c of comments) c.parentNode?.removeChild(c);

  let html = "<!doctype html>" + root.outerHTML;
  const truncated = html.length > MAX_HTML;
  if (truncated) html = html.slice(0, MAX_HTML);

  let selectionText: string | undefined;
  try {
    const sel = d.getSelection ? d.getSelection() : null;
    const t = sel ? sel.toString() : "";
    if (t && t.trim()) selectionText = t.slice(0, MAX_SELECTION);
  } catch {
    selectionText = undefined;
  }

  const out: RawCapture = { url: d.URL, title: (d.title || "").slice(0, 500), html, truncated };
  if (selectionText !== undefined) out.selectionText = selectionText;
  return out;
}

export type PageAccess =
  | { readable: true }
  | { readable: false; reason: "browser_page" | "store_page" | "pdf_viewer" | "not_http" | "unknown" };

/** Pages Chrome/Edge never let extensions script, decided from the tab URL alone. */
export function classifyUrl(rawUrl: string | undefined | null): PageAccess {
  if (!rawUrl) return { readable: false, reason: "unknown" };
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { readable: false, reason: "unknown" };
  }
  const scheme = u.protocol;
  if (["chrome:", "edge:", "about:", "chrome-untrusted:", "devtools:", "view-source:", "chrome-search:", "brave:", "opera:", "vivaldi:"].includes(scheme)) {
    return { readable: false, reason: "browser_page" };
  }
  if (scheme === "chrome-extension:" || scheme === "extension:") {
    // The built-in PDF viewer is an extension page.
    if (u.hostname === "mhjfbmdgcfjbbpaeojofohoefgiehjai") return { readable: false, reason: "pdf_viewer" };
    return { readable: false, reason: "browser_page" };
  }
  if (scheme !== "http:" && scheme !== "https:") return { readable: false, reason: "not_http" };
  const host = u.hostname.toLowerCase();
  if (host === "chromewebstore.google.com" || (host === "chrome.google.com" && u.pathname.startsWith("/webstore")) || host === "microsoftedge.microsoft.com") {
    return { readable: false, reason: "store_page" };
  }
  if (/\.pdf$/i.test(u.pathname)) return { readable: false, reason: "pdf_viewer" };
  return { readable: true };
}

/** Normalize the injected function's return value (it crosses a process boundary). */
export function validateRawCapture(v: unknown): RawCapture | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || typeof o.html !== "string") return null;
  if (!/^https?:/i.test(o.url)) return null;
  const out: RawCapture = {
    url: o.url,
    title: typeof o.title === "string" ? o.title.slice(0, 500) : "",
    html: o.html.slice(0, MAX_HTML_CHARS),
    truncated: o.truncated === true,
  };
  if (typeof o.selectionText === "string" && o.selectionText.trim()) out.selectionText = o.selectionText.slice(0, MAX_SELECTION_CHARS);
  return out;
}
