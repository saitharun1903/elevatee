import { describe, expect, it } from "vitest";
import {
  extractEducation,
  extractEmploymentType,
  extractExperience,
  extractSalaryFromText,
  extractWorkplaceType,
  segmentSections,
} from "../../src/extraction";
import { classifyHeading } from "../../src/extraction/sections";

describe("classifyHeading", () => {
  it.each([
    ["Responsibilities", "responsibilities"],
    ["What you'll do:", "responsibilities"],
    ["What you’ll do", "responsibilities"],
    ["Key duties", "responsibilities"],
    ["Your role", "responsibilities"],
    ["THE ROLE", "responsibilities"],
    ["Duties", "responsibilities"],
    ["## Main duties of the job", "responsibilities"],
    ["Requirements", "required"],
    ["Qualifications:", "required"],
    ["What you'll bring", "required"],
    ["Must have", "required"],
    ["Essential criteria", "required"],
    ["Basic Qualifications", "required"],
    ["Minimum qualifications", "required"],
    ["Who you are", "required"],
    ["Skills and experience", "required"],
    ["Desired Candidate Profile", "required"],
    ["Preferred", "preferred"],
    ["Nice to have", "preferred"],
    ["Nice-to-haves", "preferred"],
    ["Desirable criteria", "preferred"],
    ["Bonus points", "preferred"],
    ["Preferred qualifications", "preferred"],
    ["Benefits", "benefits"],
    ["What we offer", "benefits"],
    ["Perks", "benefits"],
    ["Compensation", "benefits"],
    ["About us", "other"],
    ["How to apply", "other"],
  ])("%s → %s", (line, kind) => {
    expect(classifyHeading(line)).toBe(kind);
  });

  it("does not treat bullet items or sentences as headings", () => {
    expect(classifyHeading("• Requirements gathering with stakeholders")).toBeNull();
    expect(classifyHeading("Experience with React and TypeScript")).toBeNull();
    expect(classifyHeading("You will be responsible for the duties of the ward manager in their absence.")).toBeNull();
  });
});

describe("segmentSections", () => {
  const text = [
    "About us",
    "We run 12 community pharmacies.",
    "",
    "Key duties:",
    "• Dispense prescriptions accurately",
    "- Counsel patients on medicines",
    "1. Supervise pharmacy technicians",
    "",
    "Essential criteria",
    "* Registered pharmacist with the GPhC",
    "· Excellent communication",
    "▪ Prescribing experience is a plus",
    "",
    "Desirable",
    "- Independent prescriber qualification",
    "",
    "What we offer",
    "• 28 days holiday",
    "• Paid professional fees",
    "• ok",
    "",
    "How to apply",
    "• Send your CV to the branch manager",
  ].join("\n");

  it("collects bullets under each heading until the next heading", () => {
    const s = segmentSections(text);
    expect(s.responsibilities).toEqual(["Dispense prescriptions accurately", "Counsel patients on medicines", "Supervise pharmacy technicians"]);
    expect(s.requiredQualifications).toEqual(["Registered pharmacist with the GPhC", "Excellent communication"]);
    // "is a plus" inside the required list is moved to preferred.
    expect(s.preferredQualifications).toEqual(["Independent prescriber qualification", "Prescribing experience is a plus"]);
    expect(s.benefits).toEqual(["28 days holiday", "Paid professional fees", "ok"]);
  });

  it("collects short lines when a section has no bullets", () => {
    const s = segmentSections("Requirements\nA valid teaching licence\nTwo years of classroom experience\n\nBenefits\nPension");
    expect(s.requiredQualifications).toEqual(["A valid teaching licence", "Two years of classroom experience"]);
    expect(s.benefits).toEqual(["Pension"]);
  });

  it("returns empty lists when there are no headings", () => {
    const s = segmentSections("We are hiring a chef. Apply today.");
    expect(s).toEqual({ responsibilities: [], requiredQualifications: [], preferredQualifications: [], benefits: [] });
  });
});

describe("extractExperience", () => {
  it.each([
    ["3+ years of experience in hospital nursing", 3, null],
    ["We need 3-5 years of experience with IFRS reporting", 3, 5],
    ["3 to 5 yrs experience in sales", 3, 5],
    ["A minimum of 2 years in a classroom setting", 2, null],
    ["At least five years' experience as a site engineer", 5, null],
    ["Minimum of five (5) years experience in accounting", 5, null],
    ["You have 7 years of professional experience", 7, null],
    ["6 months of experience in retail", 0.5, null],
    ["Ten or more years of industry experience", 10, null],
  ])("%s", (text, min, max) => {
    const e = extractExperience(text);
    expect(e?.minYears).toBe(min);
    expect(e?.maxYears).toBe(max);
    expect(e?.raw).toBe(text);
  });

  it.each([
    "Founded 25 years ago, we are the region's leading bakery.",
    "For 20 years we have served the community of Leeds.",
    "Our company was established in 1998 and has 25 years of history.",
    "Candidates must be at least 18 years old.",
    "This is a fixed-term contract for 2 years.",
    "We have been trusted by customers for 40 years.",
    "Applicants must be 21 years of age or older.",
    "The programme lasts 3 years.",
  ])("ignores non-experience mentions: %s", (text) => {
    expect(extractExperience(text)).toBeNull();
  });

  it("skips a company-age sentence and finds the real requirement", () => {
    const e = extractExperience("Founded 30 years ago in Hamburg.\nYou bring 4+ years of experience in procurement.");
    expect(e).toEqual({ minYears: 4, maxYears: null, raw: "You bring 4+ years of experience in procurement." });
  });
});

describe("extractEducation", () => {
  it("reads level, fields and requiredness", () => {
    expect(extractEducation("Bachelor's degree in Mechanical or Production Engineering required; Master's preferred.")).toEqual({
      minLevel: "bachelor",
      fields: ["Mechanical Engineering", "Production Engineering"],
      required: true,
      raw: "Bachelor's degree in Mechanical or Production Engineering required;",
    });
  });

  it.each([
    ["B.Tech/B.E. in Computer Science", "bachelor"],
    ["BSc in Nursing", "bachelor"],
    ["BA in English Literature", "bachelor"],
    ["MBA from a recognised university", "master"],
    ["M.Tech in Structural Engineering", "master"],
    ["MSc Data Science", "master"],
    ["PhD in Molecular Biology", "doctorate"],
    ["Diploma in Mechanical Engineering", "vocational"],
    ["High school diploma or GED", "secondary"],
    ["Associate degree in Radiologic Technology", "associate"],
    ["MBBS with valid medical council registration", "professional"],
  ])("%s → %s", (text, level) => {
    expect(extractEducation(text)?.minLevel).toBe(level);
  });

  it("marks degrees with 'or equivalent experience' as not strictly required", () => {
    expect(extractEducation("Bachelor's degree in Finance or equivalent experience")?.required).toBe(false);
  });

  it("marks preferred degrees", () => {
    const e = extractEducation("A Master's degree in Public Health is preferred.");
    expect(e?.minLevel).toBe("master");
    expect(e?.required).toBe(false);
    expect(e?.fields).toEqual(["Public Health"]);
  });

  it("uses a licence only when no degree is mentioned", () => {
    expect(extractEducation("Must hold current NMC registration.")?.minLevel).toBe("professional");
    expect(extractEducation("Bachelor of Science in Nursing and current NMC registration required")?.minLevel).toBe("bachelor");
  });

  it("does not read job titles or common words as degrees", () => {
    expect(extractEducation("We are hiring a Secondary School Teacher.")).toBeNull();
    expect(extractEducation("Strong skills in MS Office and Excel.")).toBeNull();
    expect(extractEducation("This role needs a level of attention to detail.")).toBeNull();
  });
});

describe("extractSalaryFromText", () => {
  it.each([
    ["Salary: £32,000 - £38,000 per annum", "GBP", 32000, 38000, "year"],
    ["CTC: ₹8,00,000 – ₹12,00,000 per annum", "INR", 800000, 1200000, "year"],
    ["Package: AED 25,000 per month", "AED", 25000, 25000, "month"],
    ["Gehalt: €55.000 – €65.000 pro Jahr", "EUR", 55000, 65000, "year"],
    ["CA$75,000–CA$90,000 annual salary", "CAD", 75000, 90000, "year"],
    ["Pay: USD 45 - 60 per hour", "USD", 45, 60, "hour"],
    ["Compensation: US$120k–150k base", "USD", 120000, 150000, null],
    ["Stipend: ₹ 15,000 /month", "INR", 15000, 15000, "month"],
    ["Salary SGD 6,500 - 8,000 monthly", "SGD", 6500, 8000, "month"],
    ["Remuneration: ZAR 30 000 per month", "ZAR", 30000, 30000, "month"],
  ])("%s", (text, currency, min, max, period) => {
    expect(extractSalaryFromText(text)).toEqual({ currency, min, max, period, raw: text, source: "job_posting" });
  });

  it("keeps a bare $ amount but leaves the currency null (ambiguous globally)", () => {
    const s = extractSalaryFromText("Pay: $25 - $30 an hour");
    expect(s).toMatchObject({ currency: null, min: 25, max: 30, period: "hour" });
  });

  it("reads Indian LPA ranges without assuming the currency", () => {
    expect(extractSalaryFromText("Salary: 10-15 LPA")).toMatchObject({ currency: null, min: 1_000_000, max: 1_500_000, period: "year" });
  });

  it("handles 'up to' and 'from'", () => {
    expect(extractSalaryFromText("Salary up to £45,000 per year")).toMatchObject({ min: null, max: 45000 });
    expect(extractSalaryFromText("Salary from €40,000 a year")).toMatchObject({ min: 40000, max: null });
  });

  it.each([
    "We raised $50M in our Series B round.",
    "Our revenue grew to €20 million last year.",
    "Work with budgets of over £2m.",
    "Join 3,000 engineers worldwide.",
    "Competitive salary and benefits.",
    "Salary: 30000 - 40000",
  ])("returns null without explicit currency + amount + salary context: %s", (text) => {
    expect(extractSalaryFromText(text)).toBeNull();
  });
});

describe("extractWorkplaceType / extractEmploymentType", () => {
  it.each([
    ["This is a fully remote role.", "remote"],
    ["Remote", "remote"],
    ["Work from home anywhere in India", "remote"],
    ["Hybrid working: 3 days a week in our Berlin office", "hybrid"],
    ["Berlin, Germany (Hybrid)", "hybrid"],
    ["This is an on-site role at our plant.", "onsite"],
    ["Location: On-site", "onsite"],
    ["This is not a remote position; you will work from our office.", "onsite"],
  ])("%s → %s", (text, type) => {
    expect(extractWorkplaceType(text)).toBe(type);
  });

  it.each([
    "Experience with hybrid cloud infrastructure",
    "Remote patient monitoring devices",
    "Free on-site parking and gym",
    "",
  ])("returns null without an explicit workplace statement: %s", (text) => {
    expect(extractWorkplaceType(text)).toBeNull();
  });

  it.each([
    ["Full-time, permanent", "full_time"],
    ["Part time (20 hours per week)", "part_time"],
    ["12-month contract role", "contract"],
    ["Fixed-term contract until March", "contract"],
    ["Summer internship for students", "internship"],
    ["Temporary position covering maternity leave", "temporary"],
    ["Per diem nursing shifts available", "per_diem"],
  ])("%s → %s", (text, type) => {
    expect(extractEmploymentType(text)).toBe(type);
  });

  it("returns null when both full-time and part-time are offered or nothing is stated", () => {
    expect(extractEmploymentType("Full-time or part-time hours available")).toBeNull();
    expect(extractEmploymentType("You will negotiate supplier contracts.")).toBeNull();
    expect(extractEmploymentType("Work with internal teams")).toBeNull();
  });
});
