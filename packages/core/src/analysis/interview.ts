import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import { AnswerFeedback, type InterviewMode } from "../schemas";
import { ElevateError } from "../util/errors";

export const MOCK_INTERVIEW_QUESTION_COUNT = 6;

export interface InterviewContext {
  mode: InterviewMode;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  jobFamily: string | null;
  seniority: string | null;
  requirements: { id: string; text: string; importance: string }[];
  gaps: string[];
  processSteps: string[];
  reportedQuestions: string[];
  resumeSummary: string | null;
}

export interface Turn {
  role: "interviewer" | "candidate";
  content: string;
}

const MODE_BRIEF: Record<InterviewMode, string> = {
  technical: "Technical / skills interview: probe hands-on skills required by the job (adapt to the profession — clinical skills for nurses, lesson design for teachers, financial modelling for analysts, code or system design for engineers).",
  behavioral: "Behavioral interview: past-situation questions (STAR) tied to the job's responsibilities.",
  recruiter: "Recruiter screen: motivation, background walk-through, logistics such as notice period and work authorization phrased neutrally for the job's country.",
  hiring_manager: "Hiring-manager interview: ownership, judgment, how the candidate would approach this team's actual work.",
  domain: "Domain interview: industry and domain knowledge required by the job.",
  case_study: "Case study: one realistic scenario from this role, worked through step by step.",
  mixed: "Mixed interview: a realistic blend of the above suited to this job.",
};

const Step = z.object({
  feedback: AnswerFeedback.nullable(),
  nextQuestion: z.string().max(800).nullable(),
  focus: z.string().max(200).nullable(),
  done: z.boolean(),
  summary: z
    .object({ overall: z.string().max(800), strengths: z.array(z.string().max(300)).max(5), improvements: z.array(z.string().max(300)).max(5) })
    .nullable(),
});
export type InterviewStep = z.infer<typeof Step>;

function systemPrompt(ctx: InterviewContext): string {
  return `You are a realistic interviewer for this job, running a practice interview.
${UNTRUSTED_DATA_POLICY}
${MODE_BRIEF[ctx.mode]}
Job: ${ctx.jobTitle ?? "unknown"}${ctx.company ? ` at ${ctx.company}` : ""}${ctx.location ? ` (${ctx.location})` : ""}.
${ctx.jobFamily ? `Job family: ${ctx.jobFamily}.` : ""} ${ctx.seniority ? `Seniority: ${ctx.seniority}.` : ""}
Ask ONE question at a time. Ask ${MOCK_INTERVIEW_QUESTION_COUNT} questions in total, then finish.
Prefer reported questions and real process steps when provided; otherwise base questions on the job's requirements. Probe the candidate's gaps.
After each candidate answer, give honest, specific feedback on THAT answer (strengths, improvements, rating 1-5; rating null if the answer is too short to judge).
Return ONE JSON object: { "feedback": {"strengths": string[], "improvements": string[], "rating": number|null} | null, "nextQuestion": string|null, "focus": string|null, "done": boolean, "summary": {"overall": string, "strengths": string[], "improvements": string[]} | null }
- First turn: feedback null, nextQuestion = your opening question.
- When finished: done true, nextQuestion null, summary filled.`;
}

function contextBlock(ctx: InterviewContext): string {
  return [
    `Requirements:\n${ctx.requirements.map((r) => `- [${r.importance}] ${r.text}`).join("\n") || "(none)"}`,
    ctx.gaps.length ? `Candidate gaps:\n${ctx.gaps.map((g) => `- ${g}`).join("\n")}` : "Candidate gaps: unknown (no resume comparison).",
    ctx.processSteps.length ? `Researched process steps:\n${ctx.processSteps.map((s) => `- ${s}`).join("\n")}` : "",
    ctx.reportedQuestions.length ? `Reported questions:\n${ctx.reportedQuestions.map((s) => `- ${s}`).join("\n")}` : "",
    ctx.resumeSummary ? `Candidate background: ${ctx.resumeSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function interviewStep(ai: AIProvider, ctx: InterviewContext, turns: Turn[], signal?: AbortSignal): Promise<InterviewStep> {
  const asked = turns.filter((t) => t.role === "interviewer").length;
  const transcript = turns.map((t) => `${t.role === "interviewer" ? "INTERVIEWER" : "CANDIDATE"}: ${t.content}`).join("\n\n");
  const user = [
    fenceUntrusted("job_posting", contextBlock(ctx), 30_000),
    turns.length ? fenceUntrusted("candidate_answer", transcript, 30_000) : "The interview is starting now.",
    asked >= MOCK_INTERVIEW_QUESTION_COUNT ? "All questions have been asked. Give feedback on the last answer and finish with done=true and a summary." : `Questions asked so far: ${asked}.`,
  ].join("\n\n");
  const { data } = await generateStructured(ai, {
    label: "Mock interview",
    system: systemPrompt(ctx),
    user,
    schema: Step,
    temperature: 0.5,
    signal,
  });
  if (asked >= MOCK_INTERVIEW_QUESTION_COUNT) return { ...data, done: true, nextQuestion: null };
  if (!data.done && !data.nextQuestion) throw new ElevateError("ai_output_invalid", "The interviewer did not return a question. Try again.");
  return data;
}
