import { z } from "zod";

export const SourcePlatform = z.enum([
  "linkedin",
  "indeed",
  "glassdoor",
  "wellfound",
  "internshala",
  "dice",
  "ziprecruiter",
  "monster",
  "greenhouse",
  "lever",
  "workday",
  "smartrecruiters",
  "ashby",
  "company_site",
  "manual",
]);
export type SourcePlatform = z.infer<typeof SourcePlatform>;

export const WorkplaceType = z.enum(["onsite", "hybrid", "remote"]);
export type WorkplaceType = z.infer<typeof WorkplaceType>;

export const EmploymentType = z.enum([
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "apprenticeship",
  "volunteer",
  "per_diem",
  "other",
]);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const SalaryRange = z.object({
  currency: z.string().length(3).nullable(),
  min: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable(),
  /** HOUR | DAY | WEEK | MONTH | YEAR */
  period: z.enum(["hour", "day", "week", "month", "year"]).nullable(),
  /** Raw text the salary was read from. */
  raw: z.string().max(300).nullable(),
  /** Where the salary came from. Only the job posting counts as verified. */
  source: z.enum(["job_posting"]),
});
export type SalaryRange = z.infer<typeof SalaryRange>;

export const ExperienceRequirement = z.object({
  minYears: z.number().min(0).max(60).nullable(),
  maxYears: z.number().min(0).max(60).nullable(),
  raw: z.string().max(400).nullable(),
});
export type ExperienceRequirement = z.infer<typeof ExperienceRequirement>;

/** Ordinal education levels, locale-neutral. Display names are localized in the UI. */
export const EducationLevel = z.enum([
  "none",
  "secondary",
  "vocational",
  "associate",
  "bachelor",
  "master",
  "doctorate",
  "professional",
]);
export type EducationLevel = z.infer<typeof EducationLevel>;

export const EDUCATION_ORDINAL: Record<EducationLevel, number> = {
  none: 0,
  secondary: 1,
  vocational: 2,
  associate: 3,
  bachelor: 4,
  master: 5,
  professional: 5,
  doctorate: 6,
};

export const EducationRequirement = z.object({
  minLevel: EducationLevel.nullable(),
  fields: z.array(z.string().max(120)).max(10).default([]),
  required: z.boolean().nullable(),
  raw: z.string().max(400).nullable(),
});
export type EducationRequirement = z.infer<typeof EducationRequirement>;

/** Which extraction method produced each field. Used to show provenance in the UI. */
export const ExtractionMethod = z.enum([
  "json_ld",
  "microdata",
  "meta",
  "platform_dom",
  "semantic_dom",
  "manual_text",
  "ai",
]);
export type ExtractionMethod = z.infer<typeof ExtractionMethod>;

/** The normalized job shape. Every field may be null when the source does not provide it. */
export const NormalizedJob = z.object({
  canonicalUrl: z.string().url().nullable(),
  sourcePlatform: SourcePlatform,
  sourceJobId: z.string().max(200).nullable(),
  title: z.string().min(1).max(300).nullable(),
  company: z.string().min(1).max(200).nullable(),
  companyWebsite: z.string().url().nullable(),
  location: z.string().max(300).nullable(),
  country: z.string().length(2).nullable(),
  workplaceType: WorkplaceType.nullable(),
  employmentType: EmploymentType.nullable(),
  postedAt: z.string().datetime({ offset: true }).nullable(),
  validThrough: z.string().datetime({ offset: true }).nullable(),
  description: z.string().max(60_000).nullable(),
  responsibilities: z.array(z.string().max(1000)).max(80),
  requiredQualifications: z.array(z.string().max(1000)).max(80),
  preferredQualifications: z.array(z.string().max(1000)).max(80),
  benefits: z.array(z.string().max(600)).max(60),
  education: EducationRequirement.nullable(),
  experience: ExperienceRequirement.nullable(),
  salary: SalaryRange.nullable(),
  applicationUrl: z.string().url().nullable(),
});
export type NormalizedJob = z.infer<typeof NormalizedJob>;

export const ExtractionReport = z.object({
  /** Method that supplied each populated field. */
  fieldSources: z.record(z.string(), ExtractionMethod),
  methodsTried: z.array(z.string()),
  warnings: z.array(z.string()),
  /** 0..1 — share of the core fields (title, company, description) that were found. */
  completeness: z.number().min(0).max(1),
});
export type ExtractionReport = z.infer<typeof ExtractionReport>;

export const ExtractionResult = z.object({
  job: NormalizedJob,
  report: ExtractionReport,
  contentHash: z.string(),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

/** What the browser extension (or URL fetcher) captured from a page. */
export const CapturedPage = z.object({
  url: z.string().url(),
  /** Full or trimmed HTML of the page. Untrusted. */
  html: z.string().max(3_000_000),
  /** Page title from document.title. */
  title: z.string().max(500).optional(),
  /** Text of the user's selection, if they selected the job description manually. */
  selectionText: z.string().max(60_000).optional(),
  capturedAt: z.string().datetime({ offset: true }),
});
export type CapturedPage = z.infer<typeof CapturedPage>;

export const ManualJobInput = z.object({
  text: z.string().min(80, "Paste the full job description (at least a few sentences).").max(60_000),
  url: z.string().url().optional(),
  title: z.string().max(300).optional(),
  company: z.string().max(200).optional(),
  location: z.string().max(300).optional(),
});
export type ManualJobInput = z.infer<typeof ManualJobInput>;
