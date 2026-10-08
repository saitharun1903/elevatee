import { z } from "zod";
import { EducationLevel } from "./job";
import { EvidenceRef, EvidenceType } from "./evidence";

// ---------------------------------------------------------------------------
// Analysis state machine
// ---------------------------------------------------------------------------

export const AnalysisStatus = z.enum([
  "CREATED",
  "CAPTURED",
  "EXTRACTING",
  "CLASSIFYING",
  "RESEARCHING",
  "CANDIDATE_ANALYSIS",
  "ATS",
  "FIT",
  "FINALIZING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "TIMEOUT",
]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const TERMINAL_STATUSES: readonly AnalysisStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "TIMEOUT"];
export const isTerminal = (s: AnalysisStatus) => TERMINAL_STATUSES.includes(s);

export const StageName = z.enum(["extraction", "classification", "requirements", "research", "candidate", "ats", "fit"]);
export type StageName = z.infer<typeof StageName>;

export const StageOutcome = z.enum(["pending", "running", "completed", "skipped", "unavailable", "failed", "timeout"]);
export type StageOutcome = z.infer<typeof StageOutcome>;

export const StageState = z.object({
  outcome: StageOutcome,
  /** Human-readable reason for skipped/unavailable/failed. */
  reason: z.string().max(500).nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  provider: z.string().nullable(),
});
export type StageState = z.infer<typeof StageState>;

export const AnalysisEventType = z.enum([
  "analysis_started",
  "job_extracted",
  "classification_completed",
  "requirements_extracted",
  "research_started",
  "research_completed",
  "resume_analyzed",
  "ats_completed",
  "fit_completed",
  "stage_failed",
  "stage_unavailable",
  "analysis_completed",
  "analysis_failed",
  "analysis_timeout",
]);
export type AnalysisEventType = z.infer<typeof AnalysisEventType>;

// ---------------------------------------------------------------------------
// Role classification
// ---------------------------------------------------------------------------

export const Seniority = z.enum([
  "intern",
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "manager",
  "director",
  "executive",
]);
export type Seniority = z.infer<typeof Seniority>;

export const RoleClassification = z.object({
  /** e.g. "Software Engineering", "Nursing", "Financial Analysis" */
  jobFamily: z.string().max(120).nullable(),
  /** e.g. "Engineering", "Healthcare", "Finance", "Education" */
  function: z.string().max(120).nullable(),
  /** Industry / domain the role operates in, e.g. "Payments", "Acute care". */
  domain: z.string().max(120).nullable(),
  seniority: Seniority.nullable(),
  /** Whether the role is primarily technical — drives which interview modes are suggested. */
  isTechnical: z.boolean().nullable(),
  rationale: z.string().max(600).nullable(),
  evidenceType: EvidenceType,
});
export type RoleClassification = z.infer<typeof RoleClassification>;

// ---------------------------------------------------------------------------
// Skills and requirements
// ---------------------------------------------------------------------------

export const SkillImportance = z.enum(["required", "preferred", "inferred"]);
export type SkillImportance = z.infer<typeof SkillImportance>;

export const SkillCategory = z.enum([
  "technical",
  "domain",
  "tool",
  "methodology",
  "language",
  "certification",
  "license",
  "soft",
  "other",
]);

export const JobSkill = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  /** Alternate spellings used for keyword matching, e.g. ["JS"] for JavaScript. */
  aliases: z.array(z.string().max(80)).max(8).default([]),
  importance: SkillImportance,
  category: SkillCategory,
  evidence: EvidenceRef,
});
export type JobSkill = z.infer<typeof JobSkill>;

export const RequirementKind = z.enum([
  "skill",
  "experience",
  "education",
  "certification",
  "license",
  "language",
  "work_authorization",
  "physical",
  "other",
]);

export const JobRequirement = z.object({
  id: z.string(),
  text: z.string().min(1).max(600),
  kind: RequirementKind,
  importance: z.enum(["required", "preferred"]),
  evidence: EvidenceRef,
});
export type JobRequirement = z.infer<typeof JobRequirement>;

export const PrepTopic = z.object({
  topic: z.string().max(160),
  why: z.string().max(400),
  basis: z.array(z.string()).max(10),
  evidenceType: EvidenceType,
});
export type PrepTopic = z.infer<typeof PrepTopic>;

export const JobIntelligence = z.object({
  summary: z.string().max(1200).nullable(),
  requirements: z.array(JobRequirement).max(80),
  skills: z.array(JobSkill).max(80),
  education: z
    .object({ minLevel: EducationLevel.nullable(), fields: z.array(z.string()).max(10), required: z.boolean().nullable() })
    .nullable(),
  experienceYears: z.object({ min: z.number().nullable(), max: z.number().nullable() }).nullable(),
  prepTopics: z.array(PrepTopic).max(20),
  /** Requirements/skills dropped because their quoted evidence was not found in the posting. */
  droppedUnverified: z.number().int().nonnegative(),
});
export type JobIntelligence = z.infer<typeof JobIntelligence>;

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export const SourceKind = z.enum(["official", "candidate_report", "publication", "community", "aggregator", "other"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const ResearchSource = z.object({
  id: z.string(),
  provider: z.string(),
  query: z.string(),
  url: z.string().url(),
  domain: z.string(),
  title: z.string().max(500),
  snippet: z.string().max(4000),
  kind: SourceKind,
  publishedAt: z.string().nullable(),
  retrievedAt: z.string(),
});
export type ResearchSource = z.infer<typeof ResearchSource>;

export const ResearchClaimKind = z.enum(["company_fact", "process_step", "question", "salary", "development", "culture"]);
export type ResearchClaimKind = z.infer<typeof ResearchClaimKind>;

export const ResearchClaim = z.object({
  id: z.string(),
  kind: ResearchClaimKind,
  text: z.string().max(800),
  /** For process steps: order in the process. For questions: category (e.g. behavioral). */
  order: z.number().int().nullable(),
  category: z.string().max(80).nullable(),
  /** company: evidence about this employer. role: evidence about the same role elsewhere ("similar"). */
  scope: z.enum(["company", "role"]),
  evidence: EvidenceRef,
});
export type ResearchClaim = z.infer<typeof ResearchClaim>;

// ---------------------------------------------------------------------------
// Interview questions
// ---------------------------------------------------------------------------

export const QuestionOrigin = z.enum(["reported", "similar", "predicted"]);
export const InterviewQuestion = z.object({
  id: z.string(),
  text: z.string().max(600),
  origin: QuestionOrigin,
  category: z.string().max(80).nullable(),
  /** Why Elevate expects this question (for predicted) or which source reported it. */
  basis: z.string().max(400).nullable(),
  /** Job requirement ids the question relates to. */
  requirementIds: z.array(z.string()).default([]),
  evidence: EvidenceRef,
});
export type InterviewQuestion = z.infer<typeof InterviewQuestion>;

// ---------------------------------------------------------------------------
// Candidate comparison, ATS, fit
// ---------------------------------------------------------------------------

export const MatchStatus = z.enum(["match", "partial", "gap"]);
export type MatchStatus = z.infer<typeof MatchStatus>;

export const RequirementMatch = z.object({
  requirementId: z.string(),
  requirementText: z.string(),
  importance: z.enum(["required", "preferred"]),
  status: MatchStatus,
  /** Exact resume text supporting the match; verified to exist in the resume. */
  resumeQuote: z.string().max(600).nullable(),
  rationale: z.string().max(500).nullable(),
  /** True when the AI claimed evidence that could not be found in the resume and was downgraded. */
  downgraded: z.boolean(),
});
export type RequirementMatch = z.infer<typeof RequirementMatch>;

export const KeywordHit = z.object({
  skillId: z.string(),
  name: z.string(),
  importance: SkillImportance,
  found: z.boolean(),
  matchedTerm: z.string().nullable(),
});
export type KeywordHit = z.infer<typeof KeywordHit>;

export const ScoreComponent = z.object({
  key: z.enum([
    "required_keywords",
    "preferred_keywords",
    "experience",
    "education",
    "role",
    "evidence_strength",
    "required_requirements",
    "preferred_requirements",
  ]),
  weight: z.number(),
  /** 0..1, or null when the component could not be evaluated. */
  value: z.number().min(0).max(1).nullable(),
  detail: z.string().max(400),
});
export type ScoreComponent = z.infer<typeof ScoreComponent>;

export const FormatCheck = z.object({
  key: z.string(),
  ok: z.boolean(),
  detail: z.string().max(300),
});
export type FormatCheck = z.infer<typeof FormatCheck>;

export const AtsResult = z.object({
  /** 0..100 integer, or null if fewer than two components could be evaluated. */
  score: z.number().int().min(0).max(100).nullable(),
  components: z.array(ScoreComponent),
  keywords: z.array(KeywordHit),
  formatChecks: z.array(FormatCheck),
  method: z.literal("elevate-ats-estimate-v1"),
});
export type AtsResult = z.infer<typeof AtsResult>;

export const FitResult = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  components: z.array(ScoreComponent),
  strengths: z.array(z.string()).max(10),
  gaps: z.array(z.string()).max(20),
  recommendation: z.enum(["strong", "worth_applying", "significant_gaps"]).nullable(),
  method: z.literal("elevate-fit-v1"),
});
export type FitResult = z.infer<typeof FitResult>;
