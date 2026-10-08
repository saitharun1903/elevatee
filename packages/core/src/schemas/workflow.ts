import { z } from "zod";
import { EvidenceType } from "./evidence";

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

export const PREP_DURATIONS = [1, 3, 7, 14] as const;

export const PrepPlanRequest = z.object({
  durationDays: z.number().int().min(1).max(60),
  hoursPerDay: z.number().min(0.5).max(12).default(2),
  /** Use the user's resume (personalized) when available. */
  resumeVersionId: z.string().uuid().nullable().optional(),
});
export type PrepPlanRequest = z.infer<typeof PrepPlanRequest>;

export const PrepTaskKind = z.enum(["learn", "practice", "review", "research", "build", "mock_interview", "apply"]);

export const PrepTaskDraft = z.object({
  day: z.number().int().min(1),
  title: z.string().min(3).max(200),
  detail: z.string().max(1200),
  kind: PrepTaskKind,
  estimatedMinutes: z.number().int().min(5).max(720).nullable(),
  /** IDs of requirements, gaps or research claims the task addresses. */
  basis: z.array(z.string()).max(10),
  basisType: EvidenceType,
});
export type PrepTaskDraft = z.infer<typeof PrepTaskDraft>;

// ---------------------------------------------------------------------------
// Mock interview
// ---------------------------------------------------------------------------

export const InterviewMode = z.enum([
  "technical",
  "behavioral",
  "recruiter",
  "hiring_manager",
  "domain",
  "case_study",
  "mixed",
]);
export type InterviewMode = z.infer<typeof InterviewMode>;

export const AnswerFeedback = z.object({
  strengths: z.array(z.string().max(300)).max(5),
  improvements: z.array(z.string().max(300)).max(5),
  /** 1..5 rubric rating of the answer; null if the answer was too short to assess. */
  rating: z.number().int().min(1).max(5).nullable(),
});
export type AnswerFeedback = z.infer<typeof AnswerFeedback>;

// ---------------------------------------------------------------------------
// Application tracker
// ---------------------------------------------------------------------------

export const ApplicationStatus = z.enum([
  "interested",
  "applied",
  "assessment",
  "interview",
  "final_round",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatus>;

export const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  "interested",
  "applied",
  "assessment",
  "interview",
  "final_round",
  "offer",
];

export const ApplicationPatch = z.object({
  status: ApplicationStatus.optional(),
  notes: z.string().max(10_000).nullable().optional(),
  appliedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type ApplicationPatch = z.infer<typeof ApplicationPatch>;

export const ScheduledInterviewInput = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
  round: z.string().min(1).max(120),
  timezone: z.string().max(64),
  notes: z.string().max(4000).nullable().optional(),
});
export type ScheduledInterviewInput = z.infer<typeof ScheduledInterviewInput>;
