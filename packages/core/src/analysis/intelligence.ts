import { TIMEOUTS } from "../util/timeout";
import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import {
  EducationLevel,
  type JobIntelligence,
  type JobRequirement,
  type JobSkill,
  type NormalizedJob,
  type PrepTopic,
  type RoleClassification,
  Seniority,
} from "../schemas";
import { QuoteIndex } from "./evidence";

/** Plain-text rendering of a normalized job; the single text that every quote is verified against. */
export function jobToText(job: NormalizedJob): string {
  const parts: string[] = [];
  if (job.title) parts.push(`Title: ${job.title}`);
  if (job.company) parts.push(`Company: ${job.company}`);
  if (job.location) parts.push(`Location: ${job.location}`);
  if (job.employmentType) parts.push(`Employment type: ${job.employmentType}`);
  if (job.workplaceType) parts.push(`Workplace: ${job.workplaceType}`);
  if (job.description) parts.push(`\n${job.description}`);
  const list = (label: string, items: string[]) => {
    if (items.length) parts.push(`\n${label}:\n${items.map((i) => `- ${i}`).join("\n")}`);
  };
  // Lists are often already inside the description; include only when they add content.
  const desc = job.description ?? "";
  const notInDesc = (items: string[]) => items.filter((i) => !desc.includes(i.slice(0, 40)));
  list("Responsibilities", notInDesc(job.responsibilities));
  list("Required qualifications", notInDesc(job.requiredQualifications));
  list("Preferred qualifications", notInDesc(job.preferredQualifications));
  list("Benefits", notInDesc(job.benefits));
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Deterministic classification fallback (used when AI is unavailable)
// ---------------------------------------------------------------------------

const SENIORITY_PATTERNS: [RegExp, z.infer<typeof Seniority>][] = [
  [/\b(intern|internship|trainee|stagiaire|praktikant)\b/i, "intern"],
  [/\b(chief|c[etfo]o|vp|vice president|head of)\b/i, "executive"],
  [/\bdirector\b/i, "director"],
  [/\bprincipal\b|\bstaff\b|\bdistinguished\b/i, "principal"],
  [/\blead\b/i, "lead"],
  [/\b(senior|sr\.?)\b/i, "senior"],
  [/\b(manager)\b/i, "manager"],
  [/\b(junior|jr\.?|associate|graduate|entry[- ]level|fresher)\b/i, "junior"],
];

export function inferSeniorityFromTitle(title: string | null): z.infer<typeof Seniority> | null {
  if (!title) return null;
  for (const [re, s] of SENIORITY_PATTERNS) if (re.test(title)) return s;
  return null;
}

export function deterministicClassification(job: NormalizedJob): RoleClassification | null {
  const seniority = inferSeniorityFromTitle(job.title);
  if (!seniority) return null;
  return {
    jobFamily: null,
    function: null,
    domain: null,
    seniority,
    isTechnical: null,
    rationale: "Seniority read from the job title. Full role classification needs an AI provider.",
    evidenceType: "inferred",
  };
}

/**
 * Without AI, requirements come straight from the qualification lists the extractor found
 * in the posting. Skills and prep topics are left empty: they need interpretation.
 */
export function deterministicIntelligence(job: NormalizedJob): JobIntelligence {
  const requirements: JobRequirement[] = [];
  const add = (items: string[], importance: "required" | "preferred") => {
    for (const text of items) {
      requirements.push({
        id: `req_${requirements.length + 1}`,
        text,
        kind: /\byears?\b/i.test(text) ? "experience" : /\b(degree|bachelor|master|diploma|phd|graduate)\b/i.test(text) ? "education" : "other",
        importance,
        evidence: { type: "verified", origin: "job_posting", quote: text, sourceIds: [] },
      });
    }
  };
  add(job.requiredQualifications, "required");
  add(job.preferredQualifications, "preferred");
  return {
    summary: null,
    requirements,
    skills: [],
    education: job.education?.minLevel ? { minLevel: job.education.minLevel, fields: job.education.fields, required: job.education.required } : null,
    experienceYears:
      job.experience && (job.experience.minYears !== null || job.experience.maxYears !== null)
        ? { min: job.experience.minYears, max: job.experience.maxYears }
        : null,
    prepTopics: [],
    droppedUnverified: 0,
  };
}

// ---------------------------------------------------------------------------
// AI-assisted job intelligence
// ---------------------------------------------------------------------------

const Draft = z.object({
  proposed: z
    .object({
      title: z.string().max(300).nullable(),
      titleQuote: z.string().max(300).nullable(),
      company: z.string().max(200).nullable(),
      companyQuote: z.string().max(300).nullable(),
      location: z.string().max(300).nullable(),
      locationQuote: z.string().max(300).nullable(),
    })
    .nullable()
    .default(null),
  summary: z.string().max(1200).nullable(),
  classification: z.object({
    jobFamily: z.string().max(120).nullable(),
    function: z.string().max(120).nullable(),
    domain: z.string().max(120).nullable(),
    seniority: Seniority.nullable(),
    isTechnical: z.boolean().nullable(),
    rationale: z.string().max(600).nullable(),
  }),
  requirements: z
    .array(
      z.object({
        text: z.string().min(1).max(600),
        kind: z.enum(["skill", "experience", "education", "certification", "license", "language", "work_authorization", "physical", "other"]),
        importance: z.enum(["required", "preferred"]),
        quote: z.string().max(600),
      }),
    )
    .max(60),
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        aliases: z.array(z.string().max(80)).max(8).default([]),
        importance: z.enum(["required", "preferred", "inferred"]),
        category: z.enum(["technical", "domain", "tool", "methodology", "language", "certification", "license", "soft", "other"]),
        quote: z.string().max(600),
      }),
    )
    .max(60),
  education: z
    .object({ minLevel: EducationLevel.nullable(), fields: z.array(z.string().max(120)).max(10), required: z.boolean().nullable() })
    .nullable(),
  experienceYears: z.object({ min: z.number().min(0).max(60).nullable(), max: z.number().min(0).max(60).nullable() }).nullable(),
  prepTopics: z
    .array(z.object({ topic: z.string().max(160), why: z.string().max(400), requirementIndexes: z.array(z.number().int().min(0)).max(10) }))
    .max(15),
});

const SYSTEM = `You are Elevate's job analyst. You read one job posting and return a structured, evidence-backed breakdown.
The posting can be for ANY profession (healthcare, education, finance, engineering, trades, retail, government, law, design...) and ANY country. Do not assume the role is technical, do not assume a country, currency or education system.
${UNTRUSTED_DATA_POLICY}

Return ONE JSON object with this shape:
{
  "proposed": { "title": string|null, "titleQuote": string|null, "company": string|null, "companyQuote": string|null, "location": string|null, "locationQuote": string|null } | null,
  "summary": string|null,                      // 1-3 plain sentences: what this person will actually do. No hype.
  "classification": { "jobFamily": string|null, "function": string|null, "domain": string|null,
                      "seniority": "intern"|"entry"|"junior"|"mid"|"senior"|"lead"|"principal"|"manager"|"director"|"executive"|null,
                      "isTechnical": boolean|null, "rationale": string|null },
  "requirements": [ { "text": string, "kind": "skill"|"experience"|"education"|"certification"|"license"|"language"|"work_authorization"|"physical"|"other",
                      "importance": "required"|"preferred", "quote": string } ],
  "skills": [ { "name": string, "aliases": string[], "importance": "required"|"preferred"|"inferred",
                "category": "technical"|"domain"|"tool"|"methodology"|"language"|"certification"|"license"|"soft"|"other", "quote": string } ],
  "education": { "minLevel": "none"|"secondary"|"vocational"|"associate"|"bachelor"|"master"|"doctorate"|"professional"|null, "fields": string[], "required": boolean|null } | null,
  "experienceYears": { "min": number|null, "max": number|null } | null,
  "prepTopics": [ { "topic": string, "why": string, "requirementIndexes": number[] } ]
}
Rules:
- "proposed" fills ONLY fields the posting states explicitly and that are missing from the header; each needs an exact quote. Otherwise null.
- requirements: each distinct requirement the posting states. importance=preferred only when the posting marks it as preferred/nice to have/desirable/bonus. quote = exact contiguous text from the posting.
- skills: concrete skills, tools, methods, licenses or certifications. "required"/"preferred" must be stated in the posting; "inferred" means clearly implied by a stated responsibility — its quote is that responsibility. Use the posting's own wording for name. aliases: common abbreviations only.
- experienceYears/education only if the posting states them.
- prepTopics: what a candidate should prepare for THIS role, each tied to requirement indexes (0-based into your requirements array).
- Omit anything you cannot quote. Empty arrays are fine.`;

export interface IntelligenceOutput {
  intelligence: JobIntelligence;
  classification: RoleClassification;
  proposed: { title: string | null; company: string | null; location: string | null };
  provider: string;
  model: string;
}

export async function analyzeJobWithAI(
  ai: AIProvider,
  job: NormalizedJob,
  signal?: AbortSignal,
): Promise<IntelligenceOutput> {
  const text = jobToText(job);
  const { data, provider, model } = await generateStructured(ai, {
    label: "Job analysis",
    timeoutMs: TIMEOUTS.aiLong,
    system: SYSTEM,
    user: `Analyze this job posting.\n\n${fenceUntrusted("job_posting", text)}`,
    schema: Draft,
    maxOutputTokens: 8192,
    signal,
  });
  return verifyIntelligence(job, text, data, provider, model);
}

/** Exported for tests: applies evidence verification to an AI draft. */
export function verifyIntelligence(
  job: NormalizedJob,
  text: string,
  data: z.infer<typeof Draft>,
  provider: string,
  model: string,
): IntelligenceOutput {
  const index = new QuoteIndex(text);
  let dropped = 0;

  const requirements: JobRequirement[] = [];
  const indexMap = new Map<number, string>();
  data.requirements.forEach((r, i) => {
    if (!index.contains(r.quote)) {
      dropped++;
      return;
    }
    const id = `req_${requirements.length + 1}`;
    indexMap.set(i, id);
    requirements.push({
      id,
      text: r.text,
      kind: r.kind,
      importance: r.importance,
      evidence: { type: "verified", origin: "job_posting", quote: r.quote, sourceIds: [] },
    });
  });

  const seen = new Set<string>();
  const skills: JobSkill[] = [];
  for (const s of data.skills) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    if (!index.contains(s.quote)) {
      dropped++;
      continue;
    }
    seen.add(key);
    skills.push({
      id: `skill_${skills.length + 1}`,
      name: s.name.trim(),
      aliases: s.aliases.filter((a) => a.trim() && a.toLowerCase() !== key),
      importance: s.importance,
      category: s.category,
      evidence: {
        type: s.importance === "inferred" ? "inferred" : "verified",
        origin: "job_posting",
        quote: s.quote,
        sourceIds: [],
      },
    });
  }

  const prepTopics: PrepTopic[] = data.prepTopics
    .map((t) => ({
      topic: t.topic,
      why: t.why,
      basis: t.requirementIndexes.map((i) => indexMap.get(i)).filter((x): x is string => !!x),
      evidenceType: "inferred" as const,
    }))
    .filter((t) => t.basis.length > 0);

  // Experience: prefer what the deterministic extractor found in the posting, else the AI reading.
  const experienceYears =
    job.experience && (job.experience.minYears !== null || job.experience.maxYears !== null)
      ? { min: job.experience.minYears, max: job.experience.maxYears }
      : data.experienceYears;

  const education = job.education?.minLevel
    ? { minLevel: job.education.minLevel, fields: job.education.fields, required: job.education.required }
    : data.education;

  const proposed = {
    title: data.proposed?.title && index.contains(data.proposed.titleQuote) ? data.proposed.title : null,
    company: data.proposed?.company && index.contains(data.proposed.companyQuote) ? data.proposed.company : null,
    location: data.proposed?.location && index.contains(data.proposed.locationQuote) ? data.proposed.location : null,
  };

  return {
    intelligence: {
      summary: data.summary,
      requirements,
      skills,
      education,
      experienceYears,
      prepTopics,
      droppedUnverified: dropped,
    },
    classification: { ...data.classification, evidenceType: "inferred" },
    proposed,
    provider,
    model,
  };
}

export type IntelligenceDraft = z.infer<typeof Draft>;
