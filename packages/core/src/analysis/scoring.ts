import {
  EDUCATION_ORDINAL,
  type AtsResult,
  type FitResult,
  type FormatCheck,
  type JobIntelligence,
  type KeywordHit,
  type NormalizedJob,
  type ParsedResume,
  type RequirementMatch,
  type ScoreComponent,
} from "../schemas";
import { totalExperienceMonths } from "../resume/parse";
import { containsTerm } from "./evidence";

/**
 * Elevate ATS Compatibility Estimate and Fit score.
 * Both are deterministic functions of the actual job and the actual resume.
 * A component that cannot be evaluated is reported with value=null and excluded from the
 * weighted average — it is never guessed. Scores need at least two evaluated components.
 */

export interface ScoringInput {
  job: NormalizedJob;
  intel: JobIntelligence;
  resumeText: string;
  parsed: ParsedResume | null;
  /** Requirement-level comparison; null when no AI provider was available. */
  matches: RequirementMatch[] | null;
  now?: Date;
}

export function keywordCoverage(intel: JobIntelligence, resumeText: string): KeywordHit[] {
  return intel.skills.map((s) => {
    const terms = [s.name, ...s.aliases];
    const matchedTerm = terms.find((t) => containsTerm(resumeText, t)) ?? null;
    return { skillId: s.id, name: s.name, importance: s.importance, found: matchedTerm !== null, matchedTerm };
  });
}

const ratio = (hits: KeywordHit[]) => (hits.length ? hits.filter((h) => h.found).length / hits.length : null);

function experienceComponent(input: ScoringInput, weight: number): ScoreComponent {
  const req = input.intel.experienceYears;
  if (!req || req.min === null) {
    return { key: "experience", weight, value: null, detail: "The job doesn't state a years-of-experience requirement." };
  }
  const months = input.parsed ? totalExperienceMonths(input.parsed.experience, input.now) : null;
  if (months === null) {
    return { key: "experience", weight, value: null, detail: `Job asks for ${req.min}+ years; dates in your resume couldn't be read.` };
  }
  const years = months / 12;
  const value = req.min === 0 ? 1 : Math.min(1, years / req.min);
  return {
    key: "experience",
    weight,
    value,
    detail: `Job asks for ${req.min}${req.max ? `–${req.max}` : "+"} years; your resume shows about ${years.toFixed(1)} years of dated experience.`,
  };
}

function educationComponent(input: ScoringInput, weight: number): ScoreComponent {
  const req = input.intel.education;
  if (!req?.minLevel) return { key: "education", weight, value: null, detail: "The job doesn't state an education level." };
  const levels = (input.parsed?.education ?? []).map((e) => e.level).filter((l): l is NonNullable<typeof l> => !!l);
  if (levels.length === 0) return { key: "education", weight, value: null, detail: "No education level could be read from your resume." };
  const best = Math.max(...levels.map((l) => EDUCATION_ORDINAL[l]));
  const need = EDUCATION_ORDINAL[req.minLevel];
  const value = best >= need ? 1 : best === need - 1 ? 0.5 : 0;
  return {
    key: "education",
    weight,
    value,
    detail: value === 1 ? "Your education meets the stated level." : value === 0.5 ? "Your education is one level below the stated requirement." : "Your education is below the stated requirement.",
  };
}

const TITLE_STOP = new Set([
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "head", "chief", "associate", "assistant", "intern", "trainee",
  "i", "ii", "iii", "iv", "of", "and", "the", "a", "an", "for", "to", "in", "at", "-", "&", "remote", "hybrid", "contract", "temporary", "full", "time", "part",
]);
const titleTokens = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^\p{L}\p{N}+#]+/gu, " ")
      .split(" ")
      .filter((w) => w && !TITLE_STOP.has(w)),
  );

function roleComponent(input: ScoringInput, weight: number): ScoreComponent {
  const jobTitle = input.job.title;
  const titles = (input.parsed?.experience ?? []).map((e) => e.title).filter((t): t is string => !!t);
  if (!jobTitle) return { key: "role", weight, value: null, detail: "The job title wasn't available." };
  if (titles.length === 0) return { key: "role", weight, value: null, detail: "No job titles could be read from your resume." };
  const jt = titleTokens(jobTitle);
  if (jt.size === 0) return { key: "role", weight, value: null, detail: "The job title has no comparable words." };
  let best = 0;
  let bestTitle = "";
  for (const t of titles) {
    const tt = titleTokens(t);
    const overlap = [...jt].filter((w) => tt.has(w)).length / jt.size;
    if (overlap > best) {
      best = overlap;
      bestTitle = t;
    }
  }
  return {
    key: "role",
    weight,
    value: best,
    detail: best > 0 ? `Closest past title: “${bestTitle}”.` : "None of your past titles share words with this job title.",
  };
}

export function formatChecks(resumeText: string, parsed: ParsedResume | null): FormatCheck[] {
  const words = resumeText.split(/\s+/).filter(Boolean).length;
  const headings = /(experience|employment|work history|education|skills|qualifications|projects|certifications)/gi;
  const headingCount = new Set((resumeText.match(headings) ?? []).map((h) => h.toLowerCase())).size;
  const checks: FormatCheck[] = [
    { key: "contact_email", ok: !!parsed?.email, detail: parsed?.email ? "Email address found." : "No email address found — ATS systems use it to contact you." },
    { key: "contact_phone", ok: !!parsed?.phone, detail: parsed?.phone ? "Phone number found." : "No phone number found." },
    {
      key: "length",
      ok: words >= 250 && words <= 1400,
      detail: words < 250 ? `Only ${words} words — the resume may be too thin to match requirements.` : words > 1400 ? `${words} words — consider tightening to the most relevant experience.` : `${words} words.`,
    },
    {
      key: "sections",
      ok: headingCount >= 3,
      detail: headingCount >= 3 ? "Standard section headings detected." : "Few standard headings (Experience, Education, Skills) were detected; ATS parsers rely on them.",
    },
    {
      key: "dates",
      ok: !!parsed && parsed.experience.some((e) => e.start),
      detail: parsed && parsed.experience.some((e) => e.start) ? "Employment dates are readable." : "Employment dates couldn't be read; use formats like “Jan 2022 – Mar 2024”.",
    },
  ];
  return checks;
}

function weighted(components: ScoreComponent[], minEvaluated = 2): number | null {
  const evaluated = components.filter((c) => c.value !== null && c.weight > 0);
  if (evaluated.length < minEvaluated) return null;
  const total = evaluated.reduce((s, c) => s + c.weight, 0);
  return Math.round((evaluated.reduce((s, c) => s + c.weight * (c.value as number), 0) / total) * 100);
}

export function computeAts(input: ScoringInput): AtsResult {
  const keywords = keywordCoverage(input.intel, input.resumeText);
  const required = keywords.filter((k) => k.importance === "required");
  const preferred = keywords.filter((k) => k.importance === "preferred");
  const reqRatio = ratio(required);
  const prefRatio = ratio(preferred);
  const evidence = input.matches?.filter((m) => m.importance === "required") ?? null;

  const components: ScoreComponent[] = [
    {
      key: "required_keywords",
      weight: 35,
      value: reqRatio,
      detail: required.length ? `${required.filter((k) => k.found).length} of ${required.length} required skills appear in your resume.` : "No required skills were identified in the posting.",
    },
    {
      key: "preferred_keywords",
      weight: 10,
      value: prefRatio,
      detail: preferred.length ? `${preferred.filter((k) => k.found).length} of ${preferred.length} preferred skills appear in your resume.` : "The posting lists no preferred skills.",
    },
    experienceComponent(input, 20),
    educationComponent(input, 10),
    roleComponent(input, 15),
    {
      key: "evidence_strength",
      weight: 10,
      value: evidence && evidence.length ? evidence.filter((m) => m.status === "match").length / evidence.length + (evidence.filter((m) => m.status === "partial").length / evidence.length) * 0.5 : null,
      detail: evidence
        ? evidence.length
          ? `${evidence.filter((m) => m.status !== "gap").length} of ${evidence.length} required qualifications are backed by quoted resume evidence.`
          : "No required qualifications were identified."
        : "Requirement-level comparison needs an AI provider.",
    },
  ];
  return { score: weighted(components), components, keywords, formatChecks: formatChecks(input.resumeText, input.parsed), method: "elevate-ats-estimate-v1" };
}

export function computeFit(input: ScoringInput): FitResult {
  const matches = input.matches;
  if (!matches || matches.length === 0) {
    return {
      score: null,
      components: [],
      strengths: [],
      gaps: [],
      recommendation: null,
      method: "elevate-fit-v1",
    };
  }
  const val = (ms: RequirementMatch[]) =>
    ms.length ? ms.reduce((s, m) => s + (m.status === "match" ? 1 : m.status === "partial" ? 0.5 : 0), 0) / ms.length : null;
  const req = matches.filter((m) => m.importance === "required");
  const pref = matches.filter((m) => m.importance === "preferred");
  const components: ScoreComponent[] = [
    {
      key: "required_requirements",
      weight: 55,
      value: val(req),
      detail: req.length ? `${req.filter((m) => m.status === "match").length} met, ${req.filter((m) => m.status === "partial").length} partly met, ${req.filter((m) => m.status === "gap").length} not shown — of ${req.length} required.` : "No required qualifications identified.",
    },
    {
      key: "preferred_requirements",
      weight: 15,
      value: val(pref),
      detail: pref.length ? `${pref.filter((m) => m.status !== "gap").length} of ${pref.length} preferred qualifications shown.` : "No preferred qualifications listed.",
    },
    experienceComponent(input, 20),
    educationComponent(input, 10),
  ];
  // Fit is anchored on the required qualifications; without them there is nothing to judge.
  const score = components[0]!.value === null ? null : weighted(components, 1);
  const strengths = matches.filter((m) => m.status === "match").slice(0, 6).map((m) => m.requirementText);
  const gaps = matches
    .filter((m) => m.status === "gap")
    .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "required" ? -1 : 1))
    .map((m) => m.requirementText)
    .slice(0, 20);
  const requiredGap = req.some((m) => m.status === "gap");
  const recommendation = score === null ? null : score >= 75 && !requiredGap ? "strong" : score >= 50 ? "worth_applying" : "significant_gaps";
  return { score, components, strengths, gaps, recommendation, method: "elevate-fit-v1" };
}
