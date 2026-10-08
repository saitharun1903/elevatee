import Link from "next/link";
import { clsx } from "clsx";
import { getT } from "@/lib/i18n";

const t = getT();

/**
 * First-run guide. Each step is ticked from the user's real records (jobs, resumes, plans,
 * practice sessions) — never from assumed progress. Hidden once all four are done.
 */
export function GettingStarted({ hasJob, hasResume, hasPlan, hasPractice, latestJobId }: { hasJob: boolean; hasResume: boolean; hasPlan: boolean; hasPractice: boolean; latestJobId: string | null }) {
  const steps = [
    { done: hasJob, title: t("home.step1"), body: t("home.step1Body"), href: "/analyze" },
    { done: hasResume, title: t("home.step2"), body: t("home.step2Body"), href: "/profile" },
    { done: hasPlan, title: t("home.step3"), body: t("home.step3Body"), href: latestJobId ? `/jobs/${latestJobId}?tab=preparation` : "/analyze" },
    { done: hasPractice, title: t("home.step4"), body: t("home.step4Body"), href: latestJobId ? `/jobs/${latestJobId}?practice=1` : "/analyze" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section aria-labelledby="getting-started" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 id="getting-started" className="text-h3 font-medium">
          {t("home.stepsTitle")}
        </h2>
        <span className="font-mono text-meta text-ink-3">{t("home.stepsProgress", { done: doneCount })}</span>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link
              href={s.href}
              aria-current={i === next ? "step" : undefined}
              className={clsx(
                "flex h-full flex-col gap-2 rounded-md border p-4 transition-colors",
                s.done ? "border-line text-ink-3" : i === next ? "border-ink bg-surface hover:bg-raised" : "border-line hover:border-line-strong",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-meta",
                    s.done ? "bg-accent text-accent-ink" : i === next ? "bg-ink text-paper" : "border border-line-strong text-ink-3",
                  )}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className={clsx("font-medium", s.done && "line-through decoration-ink-4")}>{s.title}</span>
                <span className="sr-only">{s.done ? "(done)" : i === next ? `(${t("home.nextStep")})` : ""}</span>
              </span>
              {!s.done ? <span className="text-small text-ink-2">{s.body}</span> : null}
              {i === next ? <span className="mt-auto text-meta font-medium uppercase tracking-wider text-ink">{t("home.nextStep")} →</span> : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
