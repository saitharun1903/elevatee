import { z } from "zod";
import { EducationLevel } from "./job";

/** A parsed field that may be uncertain. `uncertain` is set when the parser could not confirm it. */
const Uncertain = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ value: t.nullable(), uncertain: z.boolean() });

export const ResumeExperience = z.object({
  title: z.string().max(200).nullable(),
  organization: z.string().max(200).nullable(),
  location: z.string().max(200).nullable(),
  /** YYYY-MM or YYYY; null if not stated. */
  start: z.string().max(10).nullable(),
  /** YYYY-MM, YYYY, "present", or null. */
  end: z.string().max(10).nullable(),
  highlights: z.array(z.string().max(600)).max(30),
  uncertain: z.boolean(),
});
export type ResumeExperience = z.infer<typeof ResumeExperience>;

export const ResumeEducation = z.object({
  institution: z.string().max(200).nullable(),
  credential: z.string().max(200).nullable(),
  level: EducationLevel.nullable(),
  field: z.string().max(200).nullable(),
  start: z.string().max(10).nullable(),
  end: z.string().max(10).nullable(),
  uncertain: z.boolean(),
});
export type ResumeEducation = z.infer<typeof ResumeEducation>;

export const ParsedResume = z.object({
  name: Uncertain(z.string().max(200)),
  email: z.string().max(200).nullable(),
  phone: z.string().max(60).nullable(),
  links: z.array(z.string().max(300)).max(10),
  location: z.string().max(200).nullable(),
  summary: z.string().max(3000).nullable(),
  skills: z.array(z.string().max(120)).max(150),
  experience: z.array(ResumeExperience).max(40),
  education: z.array(ResumeEducation).max(15),
  certifications: z.array(z.string().max(200)).max(40),
  projects: z.array(z.object({ name: z.string().max(200), description: z.string().max(1000).nullable() })).max(30),
  achievements: z.array(z.string().max(500)).max(40),
  languages: z.array(z.string().max(80)).max(20),
});
export type ParsedResume = z.infer<typeof ParsedResume>;

export const ResumeParseStatus = z.enum(["pending", "parsed", "text_only", "failed"]);
export type ResumeParseStatus = z.infer<typeof ResumeParseStatus>;

export const ResumeSourceType = z.enum(["pdf", "docx", "text"]);
export type ResumeSourceType = z.infer<typeof ResumeSourceType>;

export const RESUME_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxTextChars: 60_000,
  minTextChars: 200,
} as const;
