import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ExtractionResult } from "../../src/schemas/job";
import { computeContentHash, extractFromText, extractJob, htmlToText, quickDetect, sha256Hex } from "../../src/extraction";
import { lenientJsonParse } from "../../src/extraction/jsonld";
import { toCountryCode } from "../../src/extraction/countries";
import * as F from "./fixtures/pages";

const PASTED = `Mechanical Engineer – Production
We are expanding our forging plant and need an engineer to improve line efficiency.

Key Responsibilities:
• Run time studies and line balancing on the forging line
• Lead kaizen events with operators
• Prepare monthly OEE reports

Requirements:
• Diploma or B.E. in Mechanical Engineering
• 2+ years of experience in a manufacturing plant

Salary: ₹4.5 - 6 LPA`;

describe("extractFromText", () => {
  it("never guesses title/company/location from free text", () => {
    const r = extractFromText({ text: PASTED });
    expect(() => ExtractionResult.parse(r)).not.toThrow();
    expect(r.job.sourcePlatform).toBe("manual");
    expect(r.job.canonicalUrl).toBeNull();
    expect(r.job.title).toBeNull();
    expect(r.job.company).toBeNull();
    expect(r.job.location).toBeNull();
    expect(r.job.description).toBe(PASTED);
    expect(r.report.fieldSources.description).toBe("manual_text");
    expect(r.report.methodsTried).toEqual(["manual_text"]);
  });

  it("runs section and value extraction on the text", () => {
    const { job } = extractFromText({ text: PASTED });
    expect(job.responsibilities).toHaveLength(3);
    expect(job.requiredQualifications).toHaveLength(2);
    expect(job.experience).toMatchObject({ minYears: 2, maxYears: null });
    expect(job.education?.minLevel).toBe("vocational");
    expect(job.salary).toMatchObject({ currency: "INR", min: 450000, max: 600000, period: "year" });
  });

  it("uses user-provided fields and explicit labelled lines", () => {
    const text = `Job Title: Clinical Pharmacist\nCompany: Mercy General Hospital\nLocation: Nairobi, Kenya\n\nWe are looking for a clinical pharmacist to join our inpatient pharmacy team and support ward rounds.`;
    const labelled = extractFromText({ text });
    expect(labelled.job.title).toBe("Clinical Pharmacist");
    expect(labelled.job.company).toBe("Mercy General Hospital");
    expect(labelled.job.location).toBe("Nairobi, Kenya");
    expect(labelled.job.country).toBe("KE");

    const overridden = extractFromText({ text, title: "Senior Clinical Pharmacist", company: "Mercy Health" });
    expect(overridden.job.title).toBe("Senior Clinical Pharmacist");
    expect(overridden.job.company).toBe("Mercy Health");
    expect(overridden.job.location).toBe("Nairobi, Kenya");
  });

  it("detects the platform when a URL is given", () => {
    const r = extractFromText({ text: PASTED, url: "https://www.linkedin.com/jobs/view/3998877665/?trk=x" });
    expect(r.job.sourcePlatform).toBe("linkedin");
    expect(r.job.sourceJobId).toBe("3998877665");
    expect(r.job.canonicalUrl).toBe("https://www.linkedin.com/jobs/view/3998877665/");
    expect(r.job.company).toBeNull();
  });
});

describe("quickDetect", () => {
  it("is high confidence with JobPosting JSON-LD", () => {
    expect(quickDetect({ url: F.HOSPITAL_URL, html: F.hospitalGraphHtml })).toEqual({
      isLikelyJob: true,
      title: "Registered Nurse – Ward 7 (Acute Medicine)",
      company: "St Aidan's Hospital",
      location: "Manchester, Greater Manchester, United Kingdom",
      platform: "company_site",
      confidence: "high",
    });
  });

  it("is medium confidence on a known platform URL with an id", () => {
    const r = quickDetect({ url: F.LINKEDIN_URL, html: F.linkedinGuestHtml });
    expect(r).toMatchObject({ isLikelyJob: true, confidence: "medium", platform: "linkedin", title: "Marketing Manager", company: "Nordlicht Foods GmbH" });
  });

  it("is medium confidence when an adapter finds title and description", () => {
    const r = quickDetect({ url: "https://jobs.lever.co/maplegrove-academy", html: F.leverHtml });
    expect(r).toMatchObject({ isLikelyJob: true, confidence: "medium", platform: "lever" });
  });

  it("flags a semantic job page with low confidence", () => {
    const r = quickDetect({ url: F.BROKEN_JSONLD_URL, html: F.brokenJsonLdHtml });
    expect(r).toMatchObject({ isLikelyJob: true, confidence: "low", title: "Assistant Accountant" });
  });

  it("rejects non-job pages", () => {
    const r = quickDetect({ url: F.BLOG_URL, html: F.blogHtml });
    expect(r.isLikelyJob).toBe(false);
    expect(r.confidence).toBe("low");
    expect(r.company).toBeNull();
  });

  it("rejects empty pages", () => {
    expect(quickDetect({ url: "", html: "" })).toEqual({
      isLikelyJob: false, title: null, company: null, location: null, platform: "company_site", confidence: "low",
    });
  });
});

describe("computeContentHash / sha256Hex", () => {
  it("matches known SHA-256 vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });

  it("matches node:crypto on multi-byte and long input (test-only reference)", () => {
    for (const s of ["₹6,00,000", "Zürich – Ingénieur", "日本語の求人", "emoji 🚀 test", "x".repeat(70_001)]) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });

  it("is stable under case and whitespace differences", () => {
    const a = computeContentHash({ title: "Registered  Nurse", company: "St Aidan's", location: "Manchester", description: "Line one\nLine two" });
    const b = computeContentHash({ title: "registered nurse", company: "ST AIDAN'S", location: " manchester ", description: "line one line two" });
    const c = computeContentHash({ title: "Registered Nurse", company: "St Aidan's", location: "Leeds", description: "Line one line two" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the hash returned by extractJob", () => {
    const r = extractJob({ url: F.HOSPITAL_URL, html: F.hospitalGraphHtml });
    expect(r.contentHash).toBe(computeContentHash(r.job));
  });
});

describe("helpers", () => {
  it("htmlToText keeps block structure and decodes entities", () => {
    expect(htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;li&gt;Two&lt;/li&gt;&lt;/ul&gt;")).toBe(
      "Hello & welcome\n\n• One\n• Two",
    );
    expect(htmlToText("<div>Intro<br>Line 2</div><script>alert(1)</script><style>p{}</style><h3>Duties</h3><ul><li><p>Teach</p></li></ul>")).toBe(
      "Intro\nLine 2\n\nDuties\n\n• Teach",
    );
    expect(htmlToText("Plain   text\n\n\n\nwith gaps")).toBe("Plain text\n\nwith gaps");
    expect(htmlToText(null)).toBe("");
  });

  it("lenientJsonParse repairs common mistakes and gives up on hopeless input", () => {
    expect(lenientJsonParse('{"a": [1, 2,], "b": "x\ny",}')).toEqual({ a: [1, 2], b: "x y" });
    expect(lenientJsonParse("<!-- {\"a\": 1} -->")).toEqual({ a: 1 });
    expect(lenientJsonParse('{"a": "unterminated')).toBeUndefined();
  });

  it.each([
    ["India", "IN"], ["IN", "IN"], ["United Kingdom", "GB"], ["UK", "GB"], ["USA", "US"], ["Deutschland", "DE"],
    ["Côte d'Ivoire", "CI"], ["United Arab Emirates", "AE"], ["Korea, Republic of", "KR"], ["Atlantis", null], ["", null],
  ])("toCountryCode(%s) → %s", (input, code) => {
    expect(toCountryCode(input)).toBe(code);
  });
});
