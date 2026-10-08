import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatDate, formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { getViewer } from "@/lib/server/viewer";

const t = getT();
export const metadata: Metadata = { title: t("interviews.title") };

export default async function InterviewsPage() {
  const viewer = await getViewer();
  const [{ data: upcoming }, { data: practice }] = await Promise.all([
    viewer.db
      .from("interview_sessions")
      .select("id, scheduled_at, timezone, round, applications(jobs(id, title, company))")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at"),
    viewer.db.from("mock_interviews").select("id, mode, status, created_at, jobs(id, title, company), mock_interview_turns(role)").order("created_at", { ascending: false }).limit(50),
  ]);
  const up = (upcoming ?? []) as unknown as { id: string; scheduled_at: string; timezone: string; round: string; applications: { jobs: { id: string; title: string | null; company: string | null } | null } | null }[];
  const mocks = (practice ?? []) as unknown as { id: string; mode: string; status: string; created_at: string; jobs: { id: string; title: string | null; company: string | null } | null; mock_interview_turns: { role: string }[] }[];

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-h1">{t("interviews.title")}</h1>
        <p className="mt-2 text-ink-2">{t("interviews.lede")}</p>
      </header>

      <section>
        <h2 className="border-b border-ink pb-2 text-h3 font-medium">{t("interviews.upcoming")}</h2>
        {up.length === 0 ? (
          <p className="py-4 text-small text-ink-3">{t("home.noInterviews")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {up.map((i) => (
              <li key={i.id} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr]">
                <span className="font-mono text-small tnum">{formatDateTime(i.scheduled_at, viewer.locale, i.timezone)}</span>
                <span>
                  <span className="block font-medium">{i.round}</span>
                  {i.applications?.jobs ? (
                    <Link href={`/jobs/${i.applications.jobs.id}?tab=application`} className="text-small text-ink-3 hover:text-ink">
                      {[i.applications.jobs.title, i.applications.jobs.company].filter(Boolean).join(" · ")}
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="border-b border-ink pb-2 text-h3 font-medium">{t("interviews.practice")}</h2>
        {mocks.length === 0 ? (
          <EmptyState compact title={t("interviews.empty")} body={t("interviews.emptyBody")} action={<ButtonLink href="/jobs" variant="secondary">{t("nav.jobs")}</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-line">
            {mocks.map((m) => (
              <li key={m.id}>
                <Link href={`/interviews/${m.id}`} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
                  <span>
                    <span className="block font-medium">{t(`interviews.modes.${m.mode as "mixed"}`)}</span>
                    <span className="block text-small text-ink-3">{[m.jobs?.title, m.jobs?.company].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-small text-ink-3">
                    {t(`interviews.${m.status as "completed"}`)} · {t("interviews.answers", { n: m.mock_interview_turns.filter((x) => x.role === "candidate").length })} · {formatDate(m.created_at, viewer.locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
