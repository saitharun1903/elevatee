import "server-only";
import {
  AI_UNAVAILABLE_REASON,
  ElevateError,
  generatePrepPlan,
  interviewStep,
  MOCK_INTERVIEW_QUESTION_COUNT,
  type ApplicationPatch,
  type InterviewContext,
  type InterviewMode,
  type PrepPlanRequest,
  type ScheduledInterviewInput,
  type Turn,
} from "@elevate/core/server";
import type { Db } from "../supabase";
import { ai } from "../providers";
import { getJobWorkspace } from "./workspace";
import { notify, trackEvent } from "./events";

function requireAI() {
  const provider = ai();
  if (!provider) throw new ElevateError("provider_unavailable", AI_UNAVAILABLE_REASON);
  return provider;
}

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

export async function createPreparationPlan(ctx: { db: Db; userId: string }, jobId: string, req: PrepPlanRequest) {
  const provider = requireAI();
  const ws = await getJobWorkspace(ctx.db, jobId);
  const intel = ws.analysis?.intelligence;
  if (!intel || intel.requirements.length === 0) {
    throw new ElevateError("invalid_input", "This job has no extracted requirements yet. Run the analysis first.");
  }
  // Personalized only when a comparison exists for the requested (or current) resume.
  const wantResume = req.resumeVersionId === undefined ? ws.primaryResume?.versionId ?? null : req.resumeVersionId;
  const candidate = wantResume && ws.candidate?.matches && ws.candidate.resumeVersionId === wantResume ? ws.candidate : null;
  const out = await generatePrepPlan(provider, {
    job: ws.job,
    intel,
    classification: ws.analysis?.classification ?? null,
    matches: candidate?.matches ?? null,
    research: ws.research?.claims ?? [],
    durationDays: req.durationDays,
    hoursPerDay: req.hoursPerDay,
  });
  if (out.tasks.length === 0) throw new ElevateError("ai_output_invalid", "The plan came back without usable tasks. Try again.");

  const { data: plan, error } = await ctx.db
    .from("preparation_plans")
    .insert({
      user_id: ctx.userId,
      job_id: jobId,
      resume_version_id: candidate ? candidate.resumeVersionId : null,
      personalized: !!candidate,
      title: out.title,
      summary: out.summary,
      duration_days: req.durationDays,
      hours_per_day: req.hoursPerDay,
      provider: `${out.provider}:${out.model}`,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !plan) throw new ElevateError("internal", "Couldn't save the plan.");
  const rows = out.tasks
    .sort((a, b) => a.day - b.day)
    .map((t, i) => ({
      user_id: ctx.userId,
      plan_id: plan.id,
      day: t.day,
      position: i,
      title: t.title,
      detail: t.detail,
      kind: t.kind,
      estimated_minutes: t.estimatedMinutes,
      basis: t.basis,
      basis_type: t.basisType,
    }));
  const { error: taskErr } = await ctx.db.from("preparation_tasks").insert(rows);
  if (taskErr) {
    await ctx.db.from("preparation_plans").delete().eq("id", plan.id);
    throw new ElevateError("internal", "Couldn't save the plan tasks.");
  }
  await trackEvent(ctx.db, ctx.userId, "preparation_started", { days: req.durationDays, personalized: !!candidate });
  return { planId: plan.id };
}

export async function getPlan(db: Db, planId: string) {
  const { data, error } = await db
    .from("preparation_plans")
    .select("*, jobs(id, title, company, location), preparation_tasks(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't load the plan.");
  if (!data) throw new ElevateError("not_found", "This plan doesn't exist.");
  data.preparation_tasks.sort((a: { day: number; position: number }, b: { day: number; position: number }) => a.day - b.day || a.position - b.position);
  return data;
}

export async function setTaskDone(db: Db, taskId: string, done: boolean) {
  const { data, error } = await db
    .from("preparation_tasks")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select("id, completed_at, plan_id")
    .maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't update the task.");
  if (!data) throw new ElevateError("not_found", "Task not found.");
  // A plan is completed when every task is done.
  const { data: tasks } = await db.from("preparation_tasks").select("completed_at").eq("plan_id", data.plan_id);
  const allDone = (tasks ?? []).every((t) => t.completed_at);
  await db.from("preparation_plans").update({ status: allDone ? "completed" : "active" }).eq("id", data.plan_id);
  return data;
}

// ---------------------------------------------------------------------------
// Mock interviews
// ---------------------------------------------------------------------------

export async function startMockInterview(ctx: { db: Db; userId: string }, jobId: string, mode: InterviewMode) {
  const provider = requireAI();
  const ws = await getJobWorkspace(ctx.db, jobId);
  const intel = ws.analysis?.intelligence;
  if (!intel) throw new ElevateError("invalid_input", "Analyze this job before practicing for it.");
  const useCandidate = ws.candidate && ws.primaryResume && ws.candidate.resumeVersionId === ws.primaryResume.versionId ? ws.candidate : null;
  const claims = ws.research?.claims ?? [];
  const context: InterviewContext = {
    mode,
    jobTitle: ws.job.title,
    company: ws.job.company,
    location: ws.job.location,
    jobFamily: ws.analysis?.classification?.jobFamily ?? null,
    seniority: ws.analysis?.classification?.seniority ?? null,
    requirements: intel.requirements.map((r) => ({ id: r.id, text: r.text, importance: r.importance })),
    gaps: (useCandidate?.matches ?? []).filter((m) => m.status !== "match").map((m) => m.requirementText).slice(0, 12),
    processSteps: claims.filter((c) => c.kind === "process_step" && c.scope === "company").map((c) => c.text).slice(0, 10),
    reportedQuestions: claims.filter((c) => c.kind === "question" && c.scope === "company").map((c) => c.text).slice(0, 15),
    resumeSummary: null,
  };
  const first = await interviewStep(provider, context, []);
  const { data: session, error } = await ctx.db
    .from("mock_interviews")
    .insert({
      user_id: ctx.userId,
      job_id: jobId,
      resume_version_id: useCandidate?.resumeVersionId ?? null,
      mode,
      context,
      provider: `${provider.id}:${provider.model}`,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !session) throw new ElevateError("internal", "Couldn't start the interview.");
  await ctx.db.from("mock_interview_turns").insert({ user_id: ctx.userId, mock_interview_id: session.id, seq: 1, role: "interviewer", content: first.nextQuestion ?? "" });
  await trackEvent(ctx.db, ctx.userId, "mock_interview_started", { mode });
  return { id: session.id };
}

export async function getMockInterview(db: Db, id: string) {
  const { data, error } = await db
    .from("mock_interviews")
    .select("id, job_id, mode, status, summary, created_at, ended_at, context, jobs(id, title, company), mock_interview_turns(id, seq, role, content, feedback, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ElevateError("internal", "Couldn't load the interview.");
  if (!data) throw new ElevateError("not_found", "This practice session doesn't exist.");
  data.mock_interview_turns.sort((a: { seq: number }, b: { seq: number }) => a.seq - b.seq);
  const { context, ...rest } = data;
  return { ...rest, questionCount: MOCK_INTERVIEW_QUESTION_COUNT, contextSummary: { gaps: (context as InterviewContext).gaps.length, reported: (context as InterviewContext).reportedQuestions.length } };
}

export async function answerMockInterview(ctx: { db: Db; userId: string }, id: string, answer: string) {
  const provider = requireAI();
  const { data: s } = await ctx.db.from("mock_interviews").select("id, status, context, mock_interview_turns(seq, role, content)").eq("id", id).maybeSingle();
  if (!s) throw new ElevateError("not_found", "This practice session doesn't exist.");
  if (s.status !== "active") throw new ElevateError("conflict", "This practice session has ended.");
  const turns = [...(s.mock_interview_turns as { seq: number; role: Turn["role"]; content: string }[])].sort((a, b) => a.seq - b.seq);
  if (turns.at(-1)?.role !== "interviewer") throw new ElevateError("conflict", "Waiting for the next question.");
  const nextSeq = (turns.at(-1)?.seq ?? 0) + 1;

  const history: Turn[] = [...turns.map((t) => ({ role: t.role, content: t.content })), { role: "candidate", content: answer }];
  const step = await interviewStep(provider, s.context as InterviewContext, history);

  const inserts: Record<string, unknown>[] = [
    { user_id: ctx.userId, mock_interview_id: id, seq: nextSeq, role: "candidate", content: answer, feedback: step.feedback },
  ];
  if (!step.done && step.nextQuestion) {
    inserts.push({ user_id: ctx.userId, mock_interview_id: id, seq: nextSeq + 1, role: "interviewer", content: step.nextQuestion });
  }
  const { error } = await ctx.db.from("mock_interview_turns").insert(inserts);
  if (error) throw new ElevateError(error.code === "23505" ? "conflict" : "internal", error.code === "23505" ? "This answer was already submitted." : "Couldn't save your answer.");
  if (step.done) {
    await ctx.db.from("mock_interviews").update({ status: "completed", summary: step.summary, ended_at: new Date().toISOString() }).eq("id", id);
  }
  return { done: step.done };
}

export async function endMockInterview(db: Db, id: string) {
  const { error } = await db.from("mock_interviews").update({ status: "abandoned", ended_at: new Date().toISOString() }).eq("id", id).eq("status", "active");
  if (error) throw new ElevateError("internal", "Couldn't end the session.");
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function upsertApplication(ctx: { db: Db; userId: string }, jobId: string, patch: ApplicationPatch) {
  const { data: existing } = await ctx.db.from("applications").select("id, status, applied_at").eq("job_id", jobId).maybeSingle();
  const appliedAt = patch.appliedAt !== undefined ? patch.appliedAt : patch.status === "applied" && !existing?.applied_at ? new Date().toISOString() : undefined;
  const values = {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(appliedAt !== undefined ? { applied_at: appliedAt } : {}),
  };
  const q = existing
    ? ctx.db.from("applications").update(values).eq("id", existing.id).select("id").single<{ id: string }>()
    : ctx.db.from("applications").insert({ user_id: ctx.userId, job_id: jobId, status: patch.status ?? "interested", ...values }).select("id").single<{ id: string }>();
  const { data, error } = await q;
  if (error?.code === "23503") throw new ElevateError("not_found", "This job doesn't exist or isn't yours.");
  if (error || !data) throw new ElevateError("internal", "Couldn't update the application.");
  if (patch.status) await trackEvent(ctx.db, ctx.userId, "application_updated", { status: patch.status });
  return { id: data.id };
}

export async function patchApplication(ctx: { db: Db; userId: string }, id: string, patch: ApplicationPatch) {
  const { data } = await ctx.db.from("applications").select("job_id").eq("id", id).maybeSingle<{ job_id: string }>();
  if (!data) throw new ElevateError("not_found", "Application not found.");
  return upsertApplication(ctx, data.job_id, patch);
}

export async function listApplications(db: Db) {
  const { data, error } = await db
    .from("applications")
    .select("id, status, applied_at, notes, updated_at, jobs(id, title, company, location), interview_sessions(id, scheduled_at, round, timezone)")
    .order("updated_at", { ascending: false });
  if (error) throw new ElevateError("internal", "Couldn't load applications.");
  return data ?? [];
}

export async function scheduleInterview(ctx: { db: Db; userId: string }, applicationId: string, input: ScheduledInterviewInput) {
  const { data, error } = await ctx.db
    .from("interview_sessions")
    .insert({ user_id: ctx.userId, application_id: applicationId, scheduled_at: input.scheduledAt, timezone: input.timezone, round: input.round, notes: input.notes ?? null })
    .select("id")
    .single<{ id: string }>();
  if (error?.code === "23503") throw new ElevateError("not_found", "Application not found.");
  if (error || !data) throw new ElevateError("internal", "Couldn't save the interview.");
  await notify(ctx.db, ctx.userId, { kind: "interview_scheduled", title: `Interview scheduled: ${input.round}`, body: null, link: "/interviews" });
  return data;
}

export async function deleteInterviewSession(db: Db, id: string) {
  const { error } = await db.from("interview_sessions").delete().eq("id", id);
  if (error) throw new ElevateError("internal", "Couldn't delete the interview.");
}
