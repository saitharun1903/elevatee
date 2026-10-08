import "server-only";
import { ACTIVE_APPLICATION_STATUSES } from "@elevate/core";
import type { Db } from "../supabase";

/** Everything on Home comes from the user's real records. New users get empty arrays. */
export async function getHome(db: Db) {
  const nowIso = new Date().toISOString();
  const [jobs, apps, interviews, plans, practice, resumes, notifications, planCount, practiceCount] = await Promise.all([
    db.from("jobs").select("id, title, company, location, created_at, job_analyses(status, created_at)").is("archived_at", null).order("created_at", { ascending: false }).limit(5),
    db.from("applications").select("id, status, updated_at, jobs(id, title, company)").in("status", ACTIVE_APPLICATION_STATUSES).order("updated_at", { ascending: false }).limit(6),
    db.from("interview_sessions").select("id, scheduled_at, timezone, round, applications(id, jobs(id, title, company))").gte("scheduled_at", nowIso).order("scheduled_at").limit(5),
    db.from("preparation_plans").select("id, title, duration_days, created_at, jobs(id, title, company), preparation_tasks(completed_at)").eq("status", "active").order("created_at", { ascending: false }).limit(4),
    db.from("mock_interviews").select("id, mode, status, created_at, jobs(id, title, company)").order("created_at", { ascending: false }).limit(4),
    db.from("resumes").select("id", { count: "exact", head: true }),
    db.from("notifications").select("id, kind, title, body, link, read_at, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(5),
    db.from("preparation_plans").select("id", { count: "exact", head: true }),
    db.from("mock_interviews").select("id", { count: "exact", head: true }),
  ]);
  type JobItem = { id: string; title: string | null; company: string | null; location: string | null; created_at: string; job_analyses: { status: string; created_at: string }[] };
  return {
    recentJobs: ((jobs.data ?? []) as JobItem[]).map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      createdAt: j.created_at,
      analysisStatus: [...j.job_analyses].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
    })),
    applications: (apps.data ?? []) as unknown as { id: string; status: string; updated_at: string; jobs: { id: string; title: string | null; company: string | null } | null }[],
    upcomingInterviews: (interviews.data ?? []) as unknown as {
      id: string;
      scheduled_at: string;
      timezone: string;
      round: string;
      applications: { id: string; jobs: { id: string; title: string | null; company: string | null } | null } | null;
    }[],
    plans: ((plans.data ?? []) as unknown as { id: string; title: string; duration_days: number; created_at: string; jobs: { id: string; title: string | null; company: string | null } | null; preparation_tasks: { completed_at: string | null }[] }[]).map((p) => ({
      id: p.id,
      title: p.title,
      job: p.jobs,
      total: p.preparation_tasks.length,
      done: p.preparation_tasks.filter((t) => t.completed_at).length,
    })),
    practice: (practice.data ?? []) as unknown as { id: string; mode: string; status: string; created_at: string; jobs: { id: string; title: string | null; company: string | null } | null }[],
    hasResume: (resumes.count ?? 0) > 0,
    hasPlan: (planCount.count ?? 0) > 0,
    hasPractice: (practiceCount.count ?? 0) > 0,
    notifications: notifications.data ?? [],
  };
}

export type HomeData = Awaited<ReturnType<typeof getHome>>;
