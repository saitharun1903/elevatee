import { describe, expect, it } from "vitest";
import { ExtractionResult, NormalizedJob } from "../../src/schemas/job";
import { extractJob } from "../../src/extraction";
import * as F from "./fixtures/pages";

function run(url: string, html: string, extra: { title?: string; selectionText?: string } = {}) {
  const result = extractJob({ url, html, ...extra });
  // Every result must satisfy the public schemas.
  expect(() => ExtractionResult.parse(result)).not.toThrow();
  expect(() => NormalizedJob.parse(result.job)).not.toThrow();
  return result;
}

describe("LinkedIn guest view (DOM only)", () => {
  const r = run(F.LINKEDIN_URL, F.linkedinGuestHtml);
  const { job, report } = r;

  it("extracts the top card", () => {
    expect(job.sourcePlatform).toBe("linkedin");
    expect(job.sourceJobId).toBe("3998877665");
    expect(job.canonicalUrl).toBe("https://www.linkedin.com/jobs/view/3998877665/");
    expect(job.title).toBe("Marketing Manager");
    expect(job.company).toBe("Nordlicht Foods GmbH");
    expect(job.location).toBe("Berlin, Berlin, Germany");
    expect(job.country).toBe("DE");
    expect(job.employmentType).toBe("full_time");
    expect(report.fieldSources.title).toBe("platform_dom");
    expect(report.fieldSources.company).toBe("platform_dom");
  });

  it("segments the description and reads explicit values", () => {
    expect(job.responsibilities).toHaveLength(3);
    expect(job.requiredQualifications).toContain("Fluent German and English");
    expect(job.preferredQualifications).toEqual(["Experience launching products with German grocery retailers"]);
    expect(job.benefits).toContain("30 days of holiday");
    expect(job.workplaceType).toBe("hybrid");
    expect(job.salary).toMatchObject({ currency: "EUR", min: 65000, max: 75000, period: "year", source: "job_posting" });
    // "Founded 30 years ago" must not become an experience requirement.
    expect(job.experience).toMatchObject({ minYears: 5, maxYears: null });
    expect(job.education).toMatchObject({ minLevel: "bachelor", fields: ["Marketing", "Business Administration"] });
    expect(report.fieldSources.salary).toBe("semantic_dom");
  });

  it("does not leak page chrome into the description", () => {
    expect(job.description).toContain("Own the marketing plan");
    expect(job.description).not.toContain("Show more");
    expect(job.description).not.toContain("LinkedIn Corporation");
    expect(report.warnings).toContain("No structured job data found");
    expect(report.completeness).toBe(1);
  });

  it("never yields LinkedIn as the company", () => {
    const missing = run("https://www.linkedin.com/jobs/view/4000000001/", F.linkedinNoCompanyHtml);
    expect(missing.job.company).toBeNull();
    expect(missing.job.title).toBe("Staff Nurse");
    expect(missing.job.location).toBe("Leeds, England, United Kingdom");
    expect(missing.job.country).toBe("GB");
    expect(missing.report.warnings).toContain("Company could not be identified");
    expect(missing.report.completeness).toBeCloseTo(2 / 3, 2);

    // Even if a DOM element literally says "LinkedIn", it is not the employer.
    const tricked = run(
      "https://www.linkedin.com/jobs/view/4000000002/",
      F.linkedinNoCompanyHtml.replace('<div id="job-details">', '<a class="topcard__org-name-link">LinkedIn</a><div id="job-details">'),
    );
    expect(tricked.job.company).toBeNull();
    expect(tricked.report.warnings.some((w) => w.includes("job board"))).toBe(true);
  });
});

describe("Indeed (DOM + JSON-LD)", () => {
  const { job, report } = run(F.INDEED_URL, F.indeedHtml);

  it("prefers JSON-LD and strips tracking params", () => {
    expect(job.canonicalUrl).toBe("https://in.indeed.com/viewjob?jk=8f3a2b1c9d7e6f50");
    expect(job.sourcePlatform).toBe("indeed");
    expect(job.sourceJobId).toBe("8f3a2b1c9d7e6f50");
    expect(job.title).toBe("Mechanical Design Engineer");
    expect(job.company).toBe("Sahyadri Auto Components Pvt. Ltd.");
    expect(job.companyWebsite).toBe("https://www.sahyadri-auto.example.in/");
    expect(job.location).toBe("Pune, Maharashtra, IN");
    expect(job.country).toBe("IN");
    expect(job.employmentType).toBe("full_time");
    expect(job.postedAt).toBe("2026-09-28T00:00:00.000Z");
    expect(job.validThrough).toBe("2026-11-27T18:29:59.000Z");
    expect(report.fieldSources.title).toBe("json_ld");
  });

  it("reads INR salary from baseSalary", () => {
    expect(job.salary).toEqual({ currency: "INR", min: 600000, max: 900000, period: "year", raw: "INR 600,000–900,000 per year", source: "job_posting" });
  });

  it("decodes HTML-escaped JSON-LD descriptions and segments them", () => {
    expect(job.description).toContain("Prepare GD&T drawings and BOMs");
    expect(job.description).not.toMatch(/&lt;|<p>/);
    expect(job.responsibilities).toEqual([
      "Design fixtures and tooling in SolidWorks and CATIA",
      "Prepare GD&T drawings and BOMs",
      "Coordinate with suppliers on first-article inspection",
    ]);
    expect(job.experience).toMatchObject({ minYears: 3, maxYears: 5 });
    expect(job.education).toMatchObject({ minLevel: "bachelor", fields: ["Mechanical Engineering"] });
  });

  it("keeps company null when only the job board is known, and $ alone gives currency null", () => {
    const r = run("https://ca.indeed.com/viewjob?jk=aa11bb22cc33dd44&utm_campaign=x", F.indeedNoCompanyHtml);
    expect(r.job.company).toBeNull();
    expect(r.job.title).toBe("Warehouse Associate");
    expect(r.job.salary).toMatchObject({ currency: null, min: 19, max: 22, period: "hour" });
    expect(r.job.employmentType).toBe("part_time");
    // "Calgary, AB" does not name a country; we never assume one.
    expect(r.job.country).toBeNull();
    expect(r.report.warnings).toContain("Company could not be identified");
  });
});

describe("Greenhouse", () => {
  const { job } = run(F.GREENHOUSE_URL, F.greenhouseHtml);

  it("extracts title, company and remote location", () => {
    expect(job.sourcePlatform).toBe("greenhouse");
    expect(job.sourceJobId).toBe("4012345005");
    expect(job.canonicalUrl).toBe("https://boards.greenhouse.io/kestrellabs/jobs/4012345005");
    expect(job.title).toBe("Senior Software Engineer, Platform");
    expect(job.company).toBe("Kestrel Labs");
    expect(job.location).toBe("Remote");
    expect(job.workplaceType).toBe("remote");
    expect(job.country).toBeNull();
  });

  it("reads the salary currency only from the explicit USD code", () => {
    expect(job.salary).toMatchObject({ currency: "USD", min: 140000, max: 170000, period: "year" });
    expect(job.experience?.minYears).toBe(6);
    expect(job.preferredQualifications).toEqual(["Contributions to open-source observability projects"]);
    expect(job.description).not.toContain("First Name");
  });
});

describe("Lever", () => {
  const { job } = run(F.LEVER_URL, F.leverHtml);

  it("extracts the posting headline and categories", () => {
    expect(job.sourcePlatform).toBe("lever");
    expect(job.sourceJobId).toBe("5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13");
    expect(job.canonicalUrl).toBe("https://jobs.lever.co/maplegrove-academy/5b1c7a9e-3f2d-4e8a-9c61-0d2b4f8e7a13");
    expect(job.title).toBe("Secondary School Mathematics Teacher");
    expect(job.company).toBe("Maple Grove Academy");
    expect(job.location).toBe("Toronto, Ontario");
    expect(job.employmentType).toBe("full_time");
    expect(job.workplaceType).toBe("onsite");
  });

  it("reads lists under h3 headings and CAD salary", () => {
    expect(job.responsibilities).toHaveLength(3);
    expect(job.requiredQualifications[0]).toMatch(/Bachelor of Education/);
    expect(job.preferredQualifications).toEqual(["Experience coaching a robotics or math club"]);
    expect(job.salary).toMatchObject({ currency: "CAD", min: 68000, max: 92000, period: "year" });
    expect(job.education?.minLevel).toBe("bachelor");
    expect(job.experience?.minYears).toBe(2);
    expect(job.description).not.toContain("Apply for this job");
  });
});

describe("Workday (DOM + JSON-LD)", () => {
  const { job, report } = run(F.WORKDAY_URL, F.workdayHtml);

  it("merges JSON-LD with Workday automation-id fields", () => {
    expect(job.sourcePlatform).toBe("workday");
    expect(job.sourceJobId).toBe("JR-104233");
    expect(job.canonicalUrl).toBe("https://gulfstar.wd3.myworkdayjobs.com/en-US/Careers/job/Dubai---DIFC/Financial-Analyst_JR-104233");
    expect(job.title).toBe("Financial Analyst");
    expect(job.company).toBe("Gulfstar Holdings");
    expect(job.country).toBe("AE");
    expect(job.workplaceType).toBe("hybrid");
    expect(report.fieldSources.workplaceType).toBe("platform_dom");
    expect(job.employmentType).toBe("full_time");
  });

  it("reads AED monthly salary from the description", () => {
    expect(job.salary).toMatchObject({ currency: "AED", min: 18000, max: 22000, period: "month" });
    expect(job.responsibilities).toEqual(["Build monthly management reports for the board", "Own the annual budgeting and forecasting cycle"]);
    expect(job.preferredQualifications).toEqual(["CFA or ACCA progress preferred"]);
    expect(job.experience?.minYears).toBe(4);
  });
});

describe("company career page with JSON-LD in @graph", () => {
  const { job, report } = run(F.HOSPITAL_URL, F.hospitalGraphHtml);

  it("finds the JobPosting inside @graph", () => {
    expect(job.sourcePlatform).toBe("company_site");
    expect(job.canonicalUrl).toBe("https://careers.staidans-hospital.example.org/vacancies/rn-ward-7");
    expect(job.title).toBe("Registered Nurse – Ward 7 (Acute Medicine)");
    expect(job.company).toBe("St Aidan's Hospital");
    expect(job.location).toBe("Manchester, Greater Manchester, United Kingdom");
    expect(job.country).toBe("GB");
    expect(job.sourceJobId).toBe("SAH-RN-2026-117");
    expect(job.validThrough).toBe("2026-10-20T22:59:00.000Z");
    expect(report.fieldSources.company).toBe("json_ld");
  });

  it("maps structured salary, experience, education and benefits", () => {
    expect(job.salary).toMatchObject({ currency: "GBP", min: 35392, max: 42618, period: "year" });
    expect(job.experience).toMatchObject({ minYears: 1 });
    expect(job.education).toMatchObject({ minLevel: "bachelor" });
    expect(job.benefits).toEqual(["27 days annual leave plus bank holidays", "NHS Pension Scheme", "Cycle to work scheme"]);
    expect(report.fieldSources.benefits).toBe("json_ld");
    expect(job.responsibilities).toHaveLength(3);
    expect(job.requiredQualifications).toHaveLength(2);
    expect(job.preferredQualifications).toEqual(["Mentorship or practice assessor qualification"]);
    expect(job.workplaceType).toBe("onsite");
  });

  it("does not use og:site_name when structured data names the employer", () => {
    expect(report.warnings).not.toContain("Company inferred from site name");
  });
});

describe("invalid JSON-LD", () => {
  it("falls back to the semantic DOM", () => {
    const { job, report } = run(F.BROKEN_JSONLD_URL, F.brokenJsonLdHtml);
    expect(report.warnings).toContain("Ignored 1 invalid JSON-LD block(s)");
    expect(report.warnings).toContain("No structured job data found");
    expect(job.title).toBe("Assistant Accountant");
    expect(job.company).toBe("Lion City Logistics Pte Ltd");
    expect(job.location).toBe("Jurong East, Singapore");
    expect(job.country).toBe("SG");
    expect(job.salary).toMatchObject({ currency: "SGD", min: 3800, max: 4500, period: "month" });
    expect(job.responsibilities).toHaveLength(3);
    expect(job.education?.minLevel).toBe("vocational");
    expect(report.fieldSources.title).toBe("semantic_dom");
    expect(job.description).not.toContain("About");
  });

  it("repairs trailing commas and raw newlines", () => {
    const { job, report } = run("https://farmacia.example.cl/empleo/1", F.recoverableJsonLdHtml);
    expect(report.fieldSources.title).toBe("json_ld");
    expect(job.company).toBe("Farmacia Alameda");
    expect(job.location).toBe("Santiago, Chile");
    expect(job.country).toBe("CL");
    expect(job.description).toBe("Dispense prescriptions accurately. Counsel patients on their medicines.");
  });
});

describe("missing fields", () => {
  it("leaves absent fields null instead of inventing them", () => {
    const { job, report } = run(F.MINIMAL_URL, F.minimalHtml);
    expect(job.title).toBe("Data Entry Clerk");
    expect(job.description).toMatch(/^Enter customer orders/);
    expect(job.company).toBeNull();
    expect(job.companyWebsite).toBeNull();
    expect(job.location).toBeNull();
    expect(job.country).toBeNull();
    expect(job.workplaceType).toBeNull();
    expect(job.employmentType).toBeNull();
    expect(job.postedAt).toBeNull();
    expect(job.validThrough).toBeNull();
    expect(job.salary).toBeNull();
    expect(job.experience).toBeNull();
    expect(job.education).toBeNull();
    expect(job.applicationUrl).toBeNull();
    expect(job.sourceJobId).toBeNull();
    expect(job.responsibilities).toEqual([]);
    expect(job.benefits).toEqual([]);
    expect(report.warnings).toContain("Company could not be identified");
    expect(report.warnings).toContain("Description is very short");
    expect(report.completeness).toBeCloseTo(2 / 3, 2);
  });

  it("never takes the employer from an ATS host or its site name", () => {
    const html = F.minimalHtml.replace("<title>", '<meta property="og:site_name" content="Greenhouse"><title>');
    const { job } = run("https://job-boards.greenhouse.io/acme/jobs/123456", html);
    expect(job.company).toBeNull();
  });

  it("uses og:site_name as company only on a company site, with a warning", () => {
    const html = F.minimalHtml.replace("<title>", '<meta property="og:site_name" content="Brightwater Dental Clinics"><title>');
    const { job, report } = run(F.MINIMAL_URL, html);
    expect(job.company).toBe("Brightwater Dental Clinics");
    expect(report.fieldSources.company).toBe("meta");
    expect(report.warnings).toContain("Company inferred from site name");
  });
});

describe("unusual layout: definition-list fields", () => {
  it("reads labelled dt/dd pairs", () => {
    const { job, report } = run(F.DL_URL, F.definitionListHtml);
    expect(job.title).toBe("Qualified Electrician");
    expect(job.company).toBe("Ubuntu Power Services (Pty) Ltd");
    expect(job.location).toBe("Johannesburg, Gauteng, South Africa");
    expect(job.country).toBe("ZA");
    expect(job.salary).toMatchObject({ currency: "ZAR", min: 22000, max: 28000, period: "month" });
    expect(job.employmentType).toBe("contract");
    expect(job.sourceJobId).toBe("UPS-ELEC-0419");
    expect(job.responsibilities).toEqual(["Install and test low-voltage distribution boards", "Issue Certificates of Compliance (CoC)"]);
    expect(job.experience?.minYears).toBe(3);
    expect(report.fieldSources.company).toBe("semantic_dom");
  });
});

describe("selection text", () => {
  it("uses a long user selection as the description", () => {
    const selection =
      "Responsibilities\n• Plan and deliver lessons for Year 10 chemistry\n• Mark coursework and give feedback\nRequirements\n• PGCE or equivalent teaching qualification\n• Qualified Teacher Status (QTS) is essential\nWe offer a supportive department and excellent CPD.";
    const { job, report } = run(F.MINIMAL_URL, F.minimalHtml, { selectionText: selection });
    expect(report.fieldSources.description).toBe("manual_text");
    expect(job.description).toBe(selection);
    expect(job.responsibilities).toEqual(["Plan and deliver lessons for Year 10 chemistry", "Mark coursework and give feedback"]);
    expect(report.methodsTried).toContain("manual_text");
  });

  it("ignores short selections", () => {
    const { report } = run(F.MINIMAL_URL, F.minimalHtml, { selectionText: "Data Entry Clerk" });
    expect(report.fieldSources.description).not.toBe("manual_text");
  });
});

describe("extraction failure", () => {
  it.each([
    ["empty", ""],
    ["garbage", "<<<>>> %%% <div"],
    ["binary-ish", "\u0000\u0001\u0002"],
  ])("%s HTML yields nulls, completeness 0 and warnings", (_name, html) => {
    const { job, report, contentHash } = run("https://example.com/whatever", html);
    expect(job.title).toBeNull();
    expect(job.company).toBeNull();
    expect(job.description).toBeNull();
    expect(report.completeness).toBe(0);
    expect(report.warnings).toEqual(
      expect.arrayContaining(["No structured job data found", "Job title could not be identified", "Company could not be identified", "No job description found"]),
    );
    expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("survives an invalid URL", () => {
    const { job } = run("not a url", F.minimalHtml);
    expect(job.canonicalUrl).toBeNull();
    expect(job.sourcePlatform).toBe("company_site");
    expect(job.title).toBe("Data Entry Clerk");
  });
});

describe("microdata", () => {
  const html = `<!DOCTYPE html><html><head><title>Civil Site Engineer</title></head><body>
  <div itemscope itemtype="https://schema.org/JobPosting">
    <h1 itemprop="title">Civil Site Engineer</h1>
    <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
      <span itemprop="name">Andes Infraestructura S.A.</span>
    </div>
    <div itemprop="jobLocation" itemscope itemtype="https://schema.org/Place">
      <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
        <span itemprop="addressLocality">Bogotá</span>, <span itemprop="addressCountry">Colombia</span>
      </div>
    </div>
    <meta itemprop="employmentType" content="CONTRACTOR">
    <time itemprop="datePosted" datetime="2026-09-15">15 Sep 2026</time>
    <div itemprop="description"><p>Supervise construction of a 4 km urban viaduct.</p><h3>Requirements</h3><ul><li>Degree in Civil Engineering</li><li>4+ years of site experience on infrastructure projects</li></ul></div>
  </div></body></html>`;

  it("maps schema.org microdata as a secondary structured source", () => {
    const { job, report } = run("https://jobs.smartrecruiters.com/AndesInfra/743999912345678-civil-site-engineer", html);
    expect(job.sourcePlatform).toBe("smartrecruiters");
    expect(job.sourceJobId).toBe("743999912345678");
    expect(report.fieldSources.title).toBe("microdata");
    expect(job.title).toBe("Civil Site Engineer");
    expect(job.company).toBe("Andes Infraestructura S.A.");
    expect(job.location).toBe("Bogotá, Colombia");
    expect(job.country).toBe("CO");
    expect(job.employmentType).toBe("contract");
    expect(job.postedAt).toBe("2026-09-15T00:00:00.000Z");
    expect(job.requiredQualifications).toContain("Degree in Civil Engineering");
    expect(job.experience?.minYears).toBe(4);
    expect(report.warnings).not.toContain("No structured job data found");
  });
});

describe("remote JSON-LD postings", () => {
  it("maps TELECOMMUTE and applicant location requirements without inventing a city", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": ["JobPosting"],
      title: "Backend Engineer",
      hiringOrganization: "Tidepool Analytics",
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: [{ "@type": "Country", name: "Philippines" }],
      employmentType: ["FULL_TIME", "CONTRACTOR"],
      description: "Build APIs in Go for our analytics platform. You will own services end to end, from design to on-call.",
      baseSalary: { "@type": "MonetaryAmount", currency: "PHP", value: { "@type": "QuantitativeValue", value: 150000, unitText: "MONTH" } },
    })}</script>`;
    const { job } = run("https://tidepool.example.ph/careers/backend", html);
    expect(job.workplaceType).toBe("remote");
    expect(job.location).toBe("Philippines");
    expect(job.country).toBe("PH");
    expect(job.company).toBe("Tidepool Analytics");
    expect(job.employmentType).toBe("full_time");
    expect(job.salary).toEqual({ currency: "PHP", min: 150000, max: 150000, period: "month", raw: "PHP 150,000 per month", source: "job_posting" });
  });

  it("drops job-board organisations and unknown currencies from JSON-LD", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Sales Associate",
      hiringOrganization: { "@type": "Organization", name: "Indeed", sameAs: "https://www.indeed.com" },
      description: "Help customers choose the right products and keep the shop floor tidy and stocked.",
      baseSalary: { "@type": "MonetaryAmount", currency: "dollars", value: { minValue: 15, maxValue: 18, unitText: "HOUR" } },
    })}</script>`;
    const { job } = run("https://www.indeed.com/viewjob?jk=1234abcd", html);
    expect(job.company).toBeNull();
    expect(job.companyWebsite).toBeNull();
    expect(job.salary).toMatchObject({ currency: null, min: 15, max: 18, period: "hour" });
  });
});
