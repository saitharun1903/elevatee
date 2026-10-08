import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import type { InterviewQuestion, JobIntelligence, NormalizedJob, ResearchClaim, RoleClassification } from "../schemas";

/** Reported and similar questions come only from verified research claims for this job. */
export function questionsFromClaims(claims: ResearchClaim[]): InterviewQuestion[] {
  return claims
    .filter((c) => c.kind === "question")
    .map((c) => ({
      id: c.id,
      text: c.text,
      origin: c.scope === "company" ? ("reported" as const) : ("similar" as const),
      category: c.category,
      basis: null,
      requirementIds: [],
      evidence: c.evidence,
    }));
}

const PredictedDraft = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().min(8).max(600),
        category: z.string().max(80),
        basisRequirementIds: z.array(z.string()).max(5),
        why: z.string().max(400),
      }),
    )
    .max(20),
  process: z
    .array(z.object({ step: z.string().max(200), description: z.string().max(400) }))
    .max(10),
});

const SYSTEM = `You are Elevate's interview coach. Predict interview questions for ONE specific job, based only on its stated requirements and responsibilities.
${UNTRUSTED_DATA_POLICY}
These are PREDICTIONS and will be labelled as such to the user. Adapt to the profession: a nurse gets clinical and patient-safety scenarios, a teacher gets classroom and pedagogy questions, an accountant gets reporting and controls questions, an engineer gets technical design questions, and so on.
Return ONE JSON object:
{ "questions": [ { "text": string, "category": string, "basisRequirementIds": string[], "why": string } ],
  "process": [ { "step": string, "description": string } ] }
- questions: 8-14 realistic questions. basisRequirementIds must be ids from the provided requirement list. "why" links the question to the requirement.
- process: a typical hiring process for this kind of role, ONLY if no researched process is provided; otherwise []. Keep it generic to the profession and country, never claim it is this employer's actual process.`;

export interface PredictionOutput {
  predicted: InterviewQuestion[];
  predictedProcess: { step: string; description: string }[];
}

export async function predictQuestions(
  ai: AIProvider,
  job: NormalizedJob,
  intel: JobIntelligence,
  classification: RoleClassification | null,
  researchedProcess: ResearchClaim[],
  opts: { signal?: AbortSignal; newId: () => string },
): Promise<PredictionOutput> {
  const reqs = intel.requirements.map((r) => `${r.id} [${r.importance}] ${r.text}`).join("\n");
  const ctx = [
    `Title: ${job.title ?? "unknown"}`,
    `Company: ${job.company ?? "unknown"}`,
    `Location: ${job.location ?? "unknown"}`,
    classification?.jobFamily ? `Job family: ${classification.jobFamily}` : null,
    classification?.seniority ? `Seniority: ${classification.seniority}` : null,
    intel.summary ? `Summary: ${intel.summary}` : null,
    `Requirements:\n${reqs || "(none extracted)"}`,
    researchedProcess.length ? `Researched process steps exist (${researchedProcess.length}); return process: [].` : "No researched process available.",
  ]
    .filter(Boolean)
    .join("\n");
  const { data } = await generateStructured(ai, {
    label: "Question prediction",
    system: SYSTEM,
    user: fenceUntrusted("job_posting", ctx),
    schema: PredictedDraft,
    temperature: 0.4,
    signal: opts.signal,
  });
  const validIds = new Set(intel.requirements.map((r) => r.id));
  const predicted: InterviewQuestion[] = data.questions.map((q) => ({
    id: opts.newId(),
    text: q.text,
    origin: "predicted",
    category: q.category,
    basis: q.why,
    requirementIds: q.basisRequirementIds.filter((id) => validIds.has(id)),
    evidence: { type: "predicted", origin: "elevate", quote: null, sourceIds: [] },
  }));
  return { predicted, predictedProcess: researchedProcess.length ? [] : data.process };
}
