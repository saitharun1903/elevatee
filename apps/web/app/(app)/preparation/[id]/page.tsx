import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isElevateError } from "@elevate/core";
import { getT } from "@/lib/i18n";
import { getPlan } from "@/lib/server/services/workflow";
import { getViewer } from "@/lib/server/viewer";
import { PlanTasks, type PlanTask } from "./plan-tasks";

const t = getT();
export const metadata: Metadata = { title: t("prep.title") };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await getViewer();
  let plan;
  try {
    plan = await getPlan(viewer.db, id);
  } catch (e) {
    if (isElevateError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const job = plan.jobs as { id: string; title: string | null; company: string | null } | null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        {job ? (
          <Link href={`/jobs/${job.id}?tab=preparation`} className="text-small text-ink-3 hover:text-ink">
            ← {[job.title, job.company].filter(Boolean).join(" · ")}
          </Link>
        ) : null}
        <h1 className="font-display text-h1">{plan.title}</h1>
        {plan.summary ? <p className="text-ink-2">{plan.summary}</p> : null}
        <p className="text-small text-ink-3">
          {t("prep.duration", { n: plan.duration_days })} ·{" "}
          {plan.personalized ? t("workspace.preparation.personalized") : t("workspace.preparation.roleOnly")}
        </p>
      </header>
      <PlanTasks tasks={plan.preparation_tasks as PlanTask[]} durationDays={plan.duration_days} />
    </div>
  );
}
