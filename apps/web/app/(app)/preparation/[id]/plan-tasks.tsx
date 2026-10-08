"use client";

import { clsx } from "clsx";
import { useState } from "react";
import { EvidenceTag } from "@/components/ui/evidence";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

export interface PlanTask {
  id: string;
  day: number;
  title: string;
  detail: string | null;
  kind: string;
  estimated_minutes: number | null;
  basis_type: "inferred" | "source_backed";
  completed_at: string | null;
}

export function PlanTasks({ tasks: initial, durationDays }: { tasks: PlanTask[]; durationDays: number }) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const done = tasks.filter((x) => x.completed_at).length;

  async function toggle(task: PlanTask) {
    const next = !task.completed_at;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, completed_at: next ? new Date().toISOString() : null } : x)));
    setError(null);
    try {
      await api(`/api/v1/preparation-tasks/${task.id}`, { method: "PATCH", json: { done: next } });
    } catch (e) {
      setTasks((ts) => ts.map((x) => (x.id === task.id ? task : x)));
      setError(errorMessage(e));
    }
  }

  const days = Array.from({ length: durationDays }, (_, i) => i + 1).filter((d) => tasks.some((x) => x.day === d));
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
        </div>
        <span className="font-mono text-small tnum">{t("prep.progress", { done, total: tasks.length })}</span>
      </div>
      {error ? <p role="alert" className="text-small text-signal">{error}</p> : null}
      {done === tasks.length && tasks.length ? <p className="text-accent">{t("prep.allDone")}</p> : null}
      {days.map((d) => (
        <section key={d} className="grid gap-4 sm:grid-cols-[5rem_1fr]">
          <h2 className="font-mono text-small text-ink-3 sm:pt-3">{t("workspace.preparation.day", { n: d })}</h2>
          <ul className="divide-y divide-line border-t border-ink">
            {tasks
              .filter((x) => x.day === d)
              .map((task) => (
                <li key={task.id} className="flex gap-4 py-4">
                  <input
                    type="checkbox"
                    id={`task-${task.id}`}
                    checked={!!task.completed_at}
                    onChange={() => toggle(task)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
                  />
                  <label htmlFor={`task-${task.id}`} className="flex flex-1 cursor-pointer flex-col gap-1.5">
                    <span className={clsx("font-medium", task.completed_at && "text-ink-3 line-through decoration-ink-4")}>{task.title}</span>
                    {task.detail ? <span className="text-small text-ink-2">{task.detail}</span> : null}
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-3">
                      <span className="font-mono uppercase tracking-wider">{task.kind.replace("_", " ")}</span>
                      {task.estimated_minutes ? <span>{t("workspace.preparation.minutes", { n: task.estimated_minutes })}</span> : null}
                      <EvidenceTag type={task.basis_type} />
                    </span>
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
