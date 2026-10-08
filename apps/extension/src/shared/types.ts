/**
 * Wire types for the Elevate API, as consumed by the extension.
 *
 * Type-only subset of the server's `JobWorkspace` (apps/web/lib/server/services/workspace.ts).
 * Domain shapes come from @elevate/core as types only; nothing here is runtime code from the server.
 * Every field the extension reads is treated as optional/nullable at the edges, because the
 * extension must keep working against older or newer servers.
 */
import type {
  AnalysisStatus,
  AtsResult,
  EvidenceType,
  FitResult,
  InterviewQuestion,
  JobIntelligence,
  NormalizedJob,
  RequirementMatch,
  ResearchClaim,
  ResearchSource,
  StageName,
  StageOutcome,
} from "@elevate/core/schemas";

export type { AnalysisStatus, EvidenceType, InterviewQuestion, NormalizedJob, RequirementMatch, ResearchClaim, StageName, StageOutcome };

export interface StageInfo {
  outcome: StageOutcome;
  reason: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  provider?: string | null;
}

/** Only the stages the server has reported are present. */
export type Stages = Partial<Record<StageName, StageInfo>>;

export interface AnalysisSnapshot {
  id: string;
  status: AnalysisStatus;
  stages: Stages | null;
  error: { code: string; message: string } | null;
}

export interface WorkspaceAnalysis extends AnalysisSnapshot {
  job_id: string;
  intelligence: JobIntelligence | null;
  questions: InterviewQuestion[] | null;
  predicted_process: { step: string; description: string }[] | null;
  completed_at: string | null;
}

export interface JobWorkspace {
  id: string;
  job: NormalizedJob;
  analysis: WorkspaceAnalysis | null;
  research: {
    status: "completed" | "failed" | "unavailable";
    provider: string | null;
    note: string | null;
    retrievedAt: string;
    sources: (ResearchSource & { scope: "company" | "role" })[];
    claims: ResearchClaim[];
  } | null;
  candidate: {
    id: string;
    resumeLabel: string | null;
    matches: RequirementMatch[] | null;
    ats: AtsResult | null;
    fit: FitResult | null;
  } | null;
  primaryResume: { versionId: string; label: string | null; version: number } | null;
  capabilities: { ai: { provider: string; model: string } | null; research: { provider: string } | null };
}

export interface AnalyzeResponse {
  jobId: string;
  analysisId: string;
  deduplicated: boolean;
  reusedAnalysis: boolean;
  extraction: { warnings: string[]; completeness: number };
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  email: string | null;
}

export interface CapturedPagePayload {
  url: string;
  html: string;
  title?: string;
  selectionText?: string;
  capturedAt: string;
}

export const TERMINAL: readonly AnalysisStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "TIMEOUT"];
export const isTerminalStatus = (s: string | null | undefined): s is AnalysisStatus =>
  typeof s === "string" && (TERMINAL as readonly string[]).includes(s);
