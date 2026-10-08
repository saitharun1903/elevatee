import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import { TIMEOUTS } from "../util/timeout";
import { PrepTaskKind, type JobIntelligence, type NormalizedJob, type PrepTaskDraft, type RequirementMatch, type ResearchClaim, type RoleClassification } from "../schemas";

const Draft = z.object({
  title: z.string().max(200),
  summary: z.string().max(800),
  tasks: z
    .array(
      z.object({
        day: z.number().int().min(1),
        title: z.string().min(3).max(200),
        detail: z.string().max(1200),
        kind: PrepTaskKind,
        estimatedMinutes: z.number().int().min(5).max(720).nullable(),
        basis: z.array(z.string()).max(10),
      }),
    )
    .max(120),
});

const SYSTEM = `You build a day-by-day preparation plan for ONE specific job application.
${UNTRUSTED_DATA_POLICY}
Return ONE JSON object: { "title": string, "summary": string, "tasks": [ { "day": number, "title": string, "detail": string, "kind": "learn"|"practice"|"review"|"research"|"build"|"mock_interview"|"apply", "estimatedMinutes": number|null, "basis": string[] } ] }
Rules:
- Every task must reference at least one id in "basis" from the provided requirement ids (req_*), gap ids, or research ids. Tasks without a valid basis are removed.
- Prioritise required gaps first (when a candidate comparison is provided), then interview process steps and reported questions, then preferred requirements.
- Fill every day: plan 2-5 tasks per day so each day's estimatedMinutes add up to roughly the hours per day given (a 1-day plan still needs several tasks). Day 1 starts now.
- Day 1 must address the most important required gap first when gaps are provided. Each gap and partial match gets at least one concrete task.
- The last day should include a mock interview task.
- Make tasks concrete for this profession (e.g. a nurse reviews medication-administration protocols; a teacher prepares a demo lesson; an analyst rebuilds a three-statement model). No generic advice like "believe in yourself".
- Do not invent facts about the employer; refer only to provided research.`;

export interface PlanInput {
  job: NormalizedJob;
  intel: JobIntelligence;
  classification: RoleClassification | null;
  matches: RequirementMatch[] | null;
  research: ResearchClaim[];
  durationDays: number;
  hoursPerDay: number;
}

export async function generatePrepPlan(ai: AIProvider, input: PlanInput, signal?: AbortSignal) {
  const reqs = input.intel.requirements.map((r) => `${r.id} [${r.importance}] ${r.text}`).join("\n");
  const gaps = input.matches
    ?.filter((m) => m.status !== "match")
    .map((m) => `${m.requirementId} (${m.status}) ${m.requirementText}`)
    .join("\n");
  const research = input.research
    .filter((c) => c.kind === "process_step" || c.kind === "question")
    .slice(0, 30)
    .map((c) => `${c.id} [${c.kind}${c.scope === "role" ? ", similar role" : ""}] ${c.text}`)
    .join("\n");
  const perDay = Math.max(2, Math.min(5, Math.round((input.hoursPerDay * 60) / 40)));
  const ctx = [
    `Job: ${input.job.title ?? "unknown"}${input.job.company ? ` at ${input.job.company}` : ""}${input.job.location ? ` (${input.job.location})` : ""}`,
    input.classification?.jobFamily ? `Job family: ${input.classification.jobFamily}` : null,
    `Days: ${input.durationDays}. Hours per day: ${input.hoursPerDay}. Target about ${perDay} tasks per day (${input.durationDays * perDay} tasks in total).`,
    `Requirements:\n${reqs || "(none)"}`,
    gaps !== undefined ? `Candidate gaps and partial matches (from the candidate's resume):\n${gaps || "(no gaps found)"}` : "No resume provided: build a role preparation plan, not a personalized one.",
    research ? `Research evidence:\n${research}` : "No research evidence available.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data, provider, model } = await generateStructured(ai, {
    label: "Preparation plan",
    system: SYSTEM,
    user: fenceUntrusted("job_posting", ctx),
    schema: Draft,
    temperature: 0.3,
    maxOutputTokens: 8192,
    timeoutMs: TIMEOUTS.aiLong,
    signal,
  });

  const valid = new Set<string>([...input.intel.requirements.map((r) => r.id), ...input.research.map((c) => c.id)]);
  const tasks: PrepTaskDraft[] = data.tasks
    .map((t) => ({ ...t, day: Math.min(Math.max(1, t.day), input.durationDays), basis: t.basis.filter((b) => valid.has(b)) }))
    .filter((t) => t.basis.length > 0 || t.kind === "mock_interview" || t.kind === "apply")
    .map((t) => ({
      ...t,
      basisType: t.basis.some((b) => input.research.find((c) => c.id === b))
        ? ("source_backed" as const)
        : ("inferred" as const),
    }));
  return { title: data.title, summary: data.summary, tasks, provider, model, droppedTasks: data.tasks.length - tasks.length };
}
