import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { capturePage, classifyUrl, validateRawCapture, MAX_HTML_CHARS } from "../src/lib/capture";

function docFrom(html: string, url = "https://jobs.example.com/roles/123?ref=abc"): Document {
  const w = new Window({ url });
  w.document.write(html);
  return w.document as unknown as Document;
}

const PAGE = `<!doctype html><html><head>
<title>Senior Nurse — Example Health</title>
<link rel="stylesheet" href="/a.css"><link rel="canonical" href="https://jobs.example.com/roles/123">
<style>body{color:red}</style>
<script>window.secret = "tracking";</script>
<script type="application/ld+json">{"@type":"JobPosting","title":"Senior Nurse"}</script>
<script type="module" src="/app.js"></script>
</head><body onload="steal()">
<!-- a comment -->
<h1 style="color:blue" onclick="x()">Senior Nurse</h1>
<img src="/logo.png"><svg><path d="M0 0"/></svg><iframe src="https://ads.example"></iframe>
<video src="/v.mp4"></video><noscript>Enable JS</noscript>
<form><input type="hidden" name="csrf" value="SECRET_TOKEN"><textarea>typed</textarea><select><option>a</option></select></form>
<section><p>Responsibilities: care for patients.</p></section>
</body></html>`;

describe("capturePage", () => {
  it("keeps job content and JSON-LD, removes scripts, media, styles, form fields, comments and handlers", () => {
    const r = capturePage(docFrom(PAGE));
    expect(r.url).toBe("https://jobs.example.com/roles/123?ref=abc");
    expect(r.title).toBe("Senior Nurse — Example Health");
    expect(r.truncated).toBe(false);
    expect(r.html.startsWith("<!doctype html>")).toBe(true);
    expect(r.html).toContain("application/ld+json");
    expect(r.html).toContain('"@type":"JobPosting"');
    expect(r.html).toContain("Responsibilities: care for patients.");
    expect(r.html).toContain('rel="canonical"');
    for (const gone of ["window.secret", "app.js", "<style", "<img", "<svg", "<iframe", "<video", "<noscript", "SECRET_TOKEN", "<textarea", "<select", "a comment", "onclick", "onload", "style=", "a.css"]) {
      expect(r.html, gone).not.toContain(gone);
    }
  });

  it("does not modify the live document", () => {
    const d = docFrom(PAGE);
    capturePage(d);
    expect(d.querySelectorAll("script").length).toBe(3);
    expect(d.querySelector("img")).not.toBeNull();
  });

  it("caps html at 2.5M characters", () => {
    const big = `<html><body><p>${"x".repeat(MAX_HTML_CHARS + 1000)}</p></body></html>`;
    const r = capturePage(docFrom(big));
    expect(r.html.length).toBe(MAX_HTML_CHARS);
    expect(r.truncated).toBe(true);
  });

  it("includes the user's selection, capped at 60k characters", () => {
    const d = docFrom(`<html><body><p id="p">${"Job description text. ".repeat(4000)}</p></body></html>`);
    const p = d.getElementById("p")!;
    const range = d.createRange();
    range.selectNodeContents(p);
    d.getSelection()!.removeAllRanges();
    d.getSelection()!.addRange(range);
    const r = capturePage(d);
    expect(r.selectionText).toBeDefined();
    expect(r.selectionText!.length).toBe(60_000);
    expect(r.selectionText!.startsWith("Job description text.")).toBe(true);
  });

  it("omits selectionText when nothing is selected", () => {
    expect(capturePage(docFrom("<html><body><p>Hi</p></body></html>")).selectionText).toBeUndefined();
  });

  it("is self-contained so executeScript can serialize it", () => {
    const src = capturePage.toString();
    // No references to other module-level helpers or imports.
    expect(src).not.toMatch(/\b(classifyUrl|validateRawCapture|MAX_HTML_CHARS|MAX_SELECTION_CHARS|import)\b/);
    const rebuilt = new Function(`return (${src})`)() as typeof capturePage;
    expect(rebuilt(docFrom(PAGE)).html).toContain("Senior Nurse");
  });
});

describe("classifyUrl", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/1", true],
    ["http://careers.example.com/job", true],
    ["chrome://extensions", false],
    ["edge://settings", false],
    ["about:blank", false],
    ["https://chromewebstore.google.com/detail/x", false],
    ["https://chrome.google.com/webstore/detail/x", false],
    ["https://microsoftedge.microsoft.com/addons/detail/x", false],
    ["chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html", false],
    ["https://example.com/jd.pdf", false],
    ["file:///C:/jd.html", false],
    ["not a url", false],
  ])("%s → readable=%s", (url, readable) => {
    expect(classifyUrl(url).readable).toBe(readable);
  });

  it("explains why", () => {
    expect(classifyUrl("chrome://newtab")).toEqual({ readable: false, reason: "browser_page" });
    expect(classifyUrl("https://chromewebstore.google.com/")).toEqual({ readable: false, reason: "store_page" });
    expect(classifyUrl("https://x.com/a.PDF")).toEqual({ readable: false, reason: "pdf_viewer" });
  });
});

describe("validateRawCapture", () => {
  it("accepts a well-formed capture and rejects non-http urls or wrong shapes", () => {
    expect(validateRawCapture({ url: "https://a.example/j", html: "<p>x</p>", title: "T" })).toMatchObject({ url: "https://a.example/j", title: "T" });
    expect(validateRawCapture({ url: "chrome://x", html: "" })).toBeNull();
    expect(validateRawCapture({ url: "https://a.example", html: 5 })).toBeNull();
    expect(validateRawCapture(null)).toBeNull();
    expect(validateRawCapture({ url: "https://a.example", html: "", selectionText: "   " })).not.toHaveProperty("selectionText");
  });
});
