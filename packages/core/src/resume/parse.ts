import { TIMEOUTS } from "../util/timeout";
import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import { containsTerm, QuoteIndex } from "../analysis/evidence";
import { EducationLevel, ParsedResume, type ParsedResume as ParsedResumeT } from "../schemas";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/;
const LINK_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|[\w-]+\.(?:dev|io|me|com)\/[\w\-/]*)/gi;

/** Deterministic contact extraction — works without AI. */
export function extractContact(text: string): { email: string | null; phone: string | null; links: string[] } {
  const head = text.slice(0, 3000);
  const email = head.match(EMAIL_RE)?.[0] ?? text.match(EMAIL_RE)?.[0] ?? null;
  const phoneMatch = head.match(PHONE_RE)?.[0] ?? null;
  const phone = phoneMatch && phoneMatch.replace(/\D/g, "").length >= 8 ? phoneMatch.trim() : null;
  const links = [...new Set((head.match(LINK_RE) ?? []).map((l) => l.trim()))].slice(0, 10);
  return { email, phone, links };
}

/** Empty parse with only deterministic fields — used when no AI provider is configured. */
export function textOnlyParse(text: string): ParsedResumeT {
  const c = extractContact(text);
  return {
    name: { value: null, uncertain: true },
    email: c.email,
    phone: c.phone,
    links: c.links,
    location: null,
    summary: null,
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    achievements: [],
    languages: [],
  };
}

const Draft = z.object({
  name: z.string().max(200).nullable(),
  location: z.string().max(200).nullable(),
  summary: z.string().max(3000).nullable(),
  skills: z.array(z.string().max(120)).max(150),
  experience: z
    .array(
      z.object({
        title: z.string().max(200).nullable(),
        organization: z.string().max(200).nullable(),
        location: z.string().max(200).nullable(),
        start: z.string().max(10).nullable(),
        end: z.string().max(10).nullable(),
        highlights: z.array(z.string().max(600)).max(30),
      }),
    )
    .max(40),
  education: z
    .array(
      z.object({
        institution: z.string().max(200).nullable(),
        credential: z.string().max(200).nullable(),
        level: EducationLevel.nullable(),
        field: z.string().max(200).nullable(),
        start: z.string().max(10).nullable(),
        end: z.string().max(10).nullable(),
      }),
    )
    .max(15),
  certifications: z.array(z.string().max(200)).max(40),
  projects: z.array(z.object({ name: z.string().max(200), description: z.string().max(1000).nullable() })).max(30),
  achievements: z.array(z.string().max(500)).max(40),
  languages: z.array(z.string().max(80)).max(20),
});

const SYSTEM = `You convert a resume into structured JSON. Resumes come from any country and profession.
${UNTRUSTED_DATA_POLICY}
Return ONE JSON object:
{ "name": string|null, "location": string|null, "summary": string|null, "skills": string[],
  "experience": [ { "title": string|null, "organization": string|null, "location": string|null, "start": "YYYY-MM"|"YYYY"|null, "end": "YYYY-MM"|"YYYY"|"present"|null, "highlights": string[] } ],
  "education": [ { "institution": string|null, "credential": string|null, "level": "none"|"secondary"|"vocational"|"associate"|"bachelor"|"master"|"doctorate"|"professional"|null, "field": string|null, "start": string|null, "end": string|null } ],
  "certifications": string[], "projects": [ { "name": string, "description": string|null } ], "achievements": string[], "languages": string[] }
Rules: copy text as written (do not rephrase skills, titles or organizations). Only include what the resume states. Map local degree names to the closest level (e.g. B.Tech/B.E./BSc/BA → bachelor, MBA/MSc/M.Tech → master, A-levels/12th/HSC → secondary, diploma/ITI → vocational, MBBS/JD/MD/PharmD → professional). Use null when unsure.`;

/** AI-assisted structured parse. Every field is checked against the resume text; unverifiable values are dropped or flagged. */
export async function parseResumeWithAI(ai: AIProvider, text: string, signal?: AbortSignal): Promise<{ parsed: ParsedResumeT; warnings: string[]; provider: string; model: string }> {
  const { data, provider, model } = await generateStructured(ai, {
    label: "Resume parsing",
    timeoutMs: TIMEOUTS.aiLong,
    system: SYSTEM,
    user: fenceUntrusted("resume", text, 60_000),
    schema: Draft,
    maxOutputTokens: 8192,
    signal,
  });
  const { parsed, warnings } = verifyParsedResume(text, data);
  return { parsed, warnings, provider, model };
}

export function verifyParsedResume(text: string, data: z.infer<typeof Draft>): { parsed: ParsedResumeT; warnings: string[] } {
  const idx = new QuoteIndex(text);
  const warnings: string[] = [];
  const contact = extractContact(text);
  const keep = (s: string | null) => (s && idx.contains(s) ? s : null);

  const skills = data.skills.filter((s) => containsTerm(text, s) || idx.contains(s));
  if (skills.length < data.skills.length) warnings.push(`${data.skills.length - skills.length} skill(s) were not found verbatim in the resume and were removed.`);

  const experience = data.experience.map((e) => {
    const title = keep(e.title);
    const organization = keep(e.organization);
    const highlights = e.highlights.filter((h) => idx.contains(h));
    const uncertain = (e.title !== null && title === null) || (e.organization !== null && organization === null) || !validPeriod(e.start) || !validPeriod(e.end);
    return {
      title: title ?? e.title,
      organization: organization ?? e.organization,
      location: keep(e.location),
      start: validPeriod(e.start) ? e.start : null,
      end: validPeriod(e.end) ? e.end : null,
      highlights,
      uncertain,
    };
  });
  if (experience.some((e) => e.uncertain)) warnings.push("Some experience entries could not be fully confirmed against the resume text.");

  const education = data.education.map((e) => ({
    institution: keep(e.institution) ?? e.institution,
    credential: keep(e.credential) ?? e.credential,
    level: e.level,
    field: e.field,
    start: validPeriod(e.start) ? e.start : null,
    end: validPeriod(e.end) ? e.end : null,
    uncertain: (e.institution !== null && keep(e.institution) === null) || e.level === null,
  }));

  const name = keep(data.name);
  const parsed = ParsedResume.parse({
    name: { value: name ?? data.name, uncertain: name === null },
    email: contact.email,
    phone: contact.phone,
    links: contact.links,
    location: keep(data.location),
    summary: data.summary && idx.contains(data.summary.slice(0, 120)) ? data.summary : null,
    skills,
    experience,
    education,
    certifications: data.certifications.filter((c) => idx.contains(c)),
    projects: data.projects.filter((p) => idx.contains(p.name)),
    achievements: data.achievements.filter((a) => idx.contains(a)),
    languages: data.languages.filter((l) => containsTerm(text, l)),
  });
  return { parsed, warnings };
}

function validPeriod(p: string | null): boolean {
  if (p === null) return true;
  return /^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/.test(p) || p === "present";
}

/**
 * Total months of experience from parsed date ranges, merging overlaps.
 * Returns null when no entry has a usable start date.
 */
export function totalExperienceMonths(experience: ParsedResumeT["experience"], now = new Date()): number | null {
  const toMonth = (p: string | null, isEnd: boolean): number | null => {
    if (!p) return null;
    if (p === "present") return now.getUTCFullYear() * 12 + now.getUTCMonth();
    const [y, m] = p.split("-");
    const year = Number(y);
    if (!year) return null;
    return year * 12 + (m ? Number(m) - 1 : isEnd ? 11 : 0);
  };
  const ranges = experience
    .map((e) => {
      const s = toMonth(e.start, false);
      // An entry without an end date is excluded rather than assumed to be ongoing.
      const en = toMonth(e.end, true);
      return s !== null && en !== null && en >= s ? ([s, en + 1] as [number, number]) : null;
    })
    .filter((r): r is [number, number] => r !== null)
    .sort((a, b) => a[0] - b[0]);
  if (ranges.length === 0) return null;
  let total = 0;
  let [cs, ce] = ranges[0]!;
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      cs = s;
      ce = e;
    }
  }
  total += ce - cs;
  return total;
}
