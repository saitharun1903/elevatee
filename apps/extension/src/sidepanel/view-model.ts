/**
 * Pure derivation of what the side panel shows from server state. No scoring, no classification,
 * no invented values: everything here is a selection or relabeling of fields the server returned.
 */
import type { EvidenceType, InterviewQuestion, JobWorkspace, RequirementMatch, StageName, StageOutcome, Stages } from "../shared/types";

export const STAGE_ORDER: readonly StageName[] = ["extraction", "classification", "requirements", "research", "candidate", "ats", "fit"];

export interface StageVM {
  key: StageName;
  outcome: StageOutcome;
  reason: string | null;
}

/** Only stages the server has reported, in pipeline order. Unknown outcomes are dropped. */
export function deriveStages(stages: Stages | null | undefined): StageVM[] {
  if (!stages) return [];
  const valid = new Set<string>(["pending", "running", "completed", "skipped", "unavailable", "failed", "timeout"]);
  const out: StageVM[] = [];
  for (const key of STAGE_ORDER) {
    const s = stages[key];
    if (!s || typeof s !== "object" || !valid.has(s.outcome)) continue;
    out.push({ key, outcome: s.outcome, reason: typeof s.reason === "string" && s.reason.trim() ? s.reason : null });
  }
  return out;
}

export type Recommendation =
  | { kind: "value"; value: "strong" | "worth_applying" | "significant_gaps" }
  | { kind: "no_resume" }
  | { kind: "unavailable"; reason: string | null };

export interface MatchVM {
  requirement: string;
  importance: "required" | "preferred";
  status: "match" | "partial" | "gap";
  quote: string | null;
}

export interface ProcessStepVM {
  text: string;
  detail: string | null;
  evidence: EvidenceType;
}

export interface ProcessVM {
  source: "company" | "similar" | "predicted";
  steps: ProcessStepVM[];
}

export interface QuestionVM {
  text: string;
  origin: "reported" | "similar" | "predicted";
  category: string | null;
  evidence: EvidenceType;
}

export interface ResultVM {
  jobId: string;
  title: string | null;
  company: string | null;
  location: string | null;
  workplaceType: string | null;
  status: string | null;
  analysisError: string | null;
  recommendation: Recommendation;
  fit: number | null;
  ats: number | null;
  topMatch: MatchVM | null;
  topGap: MatchVM | null;
  process: ProcessVM | null;
  questions: QuestionVM[];
  questionTotal: number;
  stages: StageVM[];
}

const EVIDENCE: ReadonlySet<string> = new Set(["verified", "source_backed", "candidate_reported", "inferred", "predicted"]);
const asEvidence = (v: unknown, fallback: EvidenceType): EvidenceType => (typeof v === "string" && EVIDENCE.has(v) ? (v as EvidenceType) : fallback);

const isScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

const byImportance = (a: RequirementMatch, b: RequirementMatch) => (a.importance === b.importance ? 0 : a.importance === "required" ? -1 : 1);

function toMatchVM(m: RequirementMatch): MatchVM {
  return {
    requirement: m.requirementText,
    importance: m.importance === "preferred" ? "preferred" : "required",
    status: m.status,
    quote: typeof m.resumeQuote === "string" && m.resumeQuote.trim() ? m.resumeQuote : null,
  };
}

/** First match, preferring required requirements and ones backed by a resume quote. Stable otherwise. */
export function selectTopMatch(matches: readonly RequirementMatch[] | null | undefined): MatchVM | null {
  const list = (matches ?? []).filter((m) => m && m.status === "match" && typeof m.requirementText === "string");
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => byImportance(a, b) || Number(!a.resumeQuote) - Number(!b.resumeQuote));
  return toMatchVM(sorted[0]!);
}

/** First gap (required before preferred); if there are no gaps, the first partial match. */
export function selectTopGap(matches: readonly RequirementMatch[] | null | undefined): MatchVM | null {
  const list = (matches ?? []).filter((m) => m && typeof m.requirementText === "string");
  const gaps = list.filter((m) => m.status === "gap").sort(byImportance);
  if (gaps.length) return toMatchVM(gaps[0]!);
  const partial = list.filter((m) => m.status === "partial").sort(byImportance);
  return partial.length ? toMatchVM(partial[0]!) : null;
}

/** Company-scoped process steps first; else Elevate's predicted process; else similar-role steps. */
export function selectProcess(ws: Pick<JobWorkspace, "research" | "analysis">): ProcessVM | null {
  const claims = (ws.research?.claims ?? []).filter((c) => c && c.kind === "process_step" && typeof c.text === "string" && c.text.trim());
  const ordered = (scope: "company" | "role") =>
    claims
      .filter((c) => c.scope === scope)
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (a.c.order ?? Number.MAX_SAFE_INTEGER) - (b.c.order ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
      .map(({ c }) => ({ text: c.text, detail: null, evidence: asEvidence(c.evidence?.type, "source_backed") }));

  const company = ordered("company");
  if (company.length) return { source: "company", steps: company };

  const predicted = (ws.analysis?.predicted_process ?? []).filter((p) => p && typeof p.step === "string" && p.step.trim());
  if (predicted.length) {
    return {
      source: "predicted",
      steps: predicted.map((p) => ({ text: p.step, detail: typeof p.description === "string" && p.description.trim() ? p.description : null, evidence: "predicted" as const })),
    };
  }

  const similar = ordered("role");
  if (similar.length) return { source: "similar", steps: similar };
  return null;
}

const ORIGIN_RANK: Record<string, number> = { reported: 0, similar: 1, predicted: 2 };

/** Top questions: reported, then similar, then predicted (server order within each). */
export function selectQuestions(questions: readonly InterviewQuestion[] | null | undefined, limit = 3): { items: QuestionVM[]; total: number } {
  const list = (questions ?? []).filter((q) => q && typeof q.text === "string" && q.text.trim() && q.origin in ORIGIN_RANK);
  const sorted = list
    .map((q, i) => ({ q, i }))
    .sort((a, b) => ORIGIN_RANK[a.q.origin]! - ORIGIN_RANK[b.q.origin]! || a.i - b.i)
    .map(({ q }) => q);
  return {
    total: list.length,
    items: sorted.slice(0, limit).map((q) => ({
      text: q.text,
      origin: q.origin,
      category: q.category ?? null,
      // Predicted questions are always shown as predicted, whatever else is attached.
      evidence: q.origin === "predicted" ? "predicted" : asEvidence(q.evidence?.type, q.origin === "reported" ? "candidate_reported" : "source_backed"),
    })),
  };
}

export function deriveRecommendation(ws: Pick<JobWorkspace, "candidate" | "primaryResume" | "analysis">): Recommendation {
  const rec = ws.candidate?.fit?.recommendation;
  if (rec === "strong" || rec === "worth_applying" || rec === "significant_gaps") return { kind: "value", value: rec };
  if (!ws.candidate && !ws.primaryResume) return { kind: "no_resume" };
  const stages = ws.analysis?.stages ?? null;
  const reason = stages?.fit?.reason ?? stages?.candidate?.reason ?? null;
  return { kind: "unavailable", reason: typeof reason === "string" && reason.trim() ? reason : null };
}

export function deriveResult(ws: JobWorkspace): ResultVM {
  const q = selectQuestions(ws.analysis?.questions);
  const fit = ws.candidate?.fit?.score;
  const ats = ws.candidate?.ats?.score;
  return {
    jobId: ws.id,
    title: ws.job?.title ?? null,
    company: ws.job?.company ?? null,
    location: ws.job?.location ?? null,
    workplaceType: ws.job?.workplaceType ?? null,
    status: ws.analysis?.status ?? null,
    analysisError: ws.analysis?.error?.message ?? null,
    recommendation: deriveRecommendation(ws),
    fit: isScore(fit) ? Math.round(fit) : null,
    ats: isScore(ats) ? Math.round(ats) : null,
    topMatch: selectTopMatch(ws.candidate?.matches),
    topGap: selectTopGap(ws.candidate?.matches),
    process: selectProcess(ws),
    questions: q.items,
    questionTotal: q.total,
    stages: deriveStages(ws.analysis?.stages),
  };
}
