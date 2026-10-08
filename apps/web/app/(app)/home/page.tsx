import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { GettingStarted } from "@/components/getting-started";
import { JobLine } from "@/components/job-line";
import { publicEnv } from "@/lib/env";
import { formatDateTime, relativeTime } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { getHome } from "@/lib/server/services/home";
import { getViewer } from "@/lib/server/viewer";

const t = getT();
export const metadata: Metadata = { title: t("nav.home") };

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 className="text-h3 font-medium">{title}</h2>
        {href ? (
          <Link href={href} className="text-small text-ink-3 hover:text-ink">
            {t("home.viewAll")}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="py-4 text-small text-ink-3">{children}</p>;

export default async function HomePage() {
  const viewer = await getViewer();
  const home = await getHome(viewer.db);
  const extensionHref = publicEnv.extensionStoreUrl || "/get-extension";
  const isNew = home.recentJobs.length === 0;

  if (isNew) {
    return (
      <div className="flex max-w-5xl flex-col gap-10">
        <EmptyState
          title={t("home.welcomeTitle")}
          body={t("home.welcomeBody")}
          action={
            <>
              <ButtonLink href="/analyze" size="lg">
                {t("nav.analyze")}
              </ButtonLink>
              <ButtonLink href={extensionHref} variant="secondary" size="lg" external={!!publicEnv.extensionStoreUrl}>
                {t("home.installExtension")}
              </ButtonLink>
            </>
          }
        />
        <GettingStarted hasJob={false} hasResume={home.hasResume} hasPlan={home.hasPlan} hasPractice={home.hasPractice} latestJobId={null} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-h1">{t("home.greeting")}</h1>
      </header>
      <GettingStarted hasJob hasResume={home.hasResume} hasPlan={home.hasPlan} hasPractice={home.hasPractice} latestJobId={home.recentJobs[0]?.id ?? null} />

      <div className="grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-12 lg:col-span-7">
          <Section title={t("home.recentJobs")} href="/jobs">
            <ul className="divide-y divide-line">
              {home.recentJobs.map((j) => (
                <li key={j.id}>
                  <JobLine id={j.id} title={j.title} company={j.company} location={j.location} aside={relativeTime(j.createdAt, viewer.locale)} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("home.activeApplications")} href="/jobs?view=applications">
            {home.applications.length === 0 ? (
              <Muted>{t("home.noApplications")}</Muted>
            ) : (
              <ul className="divide-y divide-line">
                {home.applications.map((a) =>
                  a.jobs ? (
                    <li key={a.id}>
                      <JobLine id={a.jobs.id} title={a.jobs.title} company={a.jobs.company} aside={<span className="font-mono text-meta uppercase tracking-wider">{t(`appStatus.${a.status as "applied"}`)}</span>} />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-12 lg:col-span-5">
          <Section title={t("home.upcomingInterviews")} href="/interviews">
            {home.upcomingInterviews.length === 0 ? (
              <Muted>{t("home.noInterviews")}</Muted>
            ) : (
              <ul className="divide-y divide-line">
                {home.upcomingInterviews.map((i) => (
                  <li key={i.id} className="py-3.5">
                    <p className="font-mono text-small tnum">{formatDateTime(i.scheduled_at, viewer.locale, i.timezone)}</p>
                    <p className="font-medium">{i.round}</p>
                    {i.applications?.jobs ? (
                      <Link href={`/jobs/${i.applications.jobs.id}?tab=application`} className="text-small text-ink-3 hover:text-ink">
                        {[i.applications.jobs.title, i.applications.jobs.company].filter(Boolean).join(" · ")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("home.preparation")} href="/preparation">
            {home.plans.length === 0 ? (
              <Muted>{t("home.noPlans")}</Muted>
            ) : (
              <ul className="divide-y divide-line">
                {home.plans.map((p) => (
                  <li key={p.id}>
                    <Link href={`/preparation/${p.id}`} className="flex flex-col gap-2 py-3.5">
                      <span className="font-medium">{p.title}</span>
                      <span className="flex items-center gap-3 text-small text-ink-3">
                        <span className="h-1 w-24 overflow-hidden rounded-full bg-sunken">
                          <span className="block h-full bg-ink" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                        </span>
                        {t("home.tasksLeft", { done: p.done, total: p.total })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("home.practice")} href="/interviews">
            {home.practice.length === 0 ? (
              <Muted>{t("home.noPractice")}</Muted>
            ) : (
              <ul className="divide-y divide-line">
                {home.practice.map((m) => (
                  <li key={m.id}>
                    <Link href={`/interviews/${m.id}`} className="flex items-baseline justify-between gap-3 py-3.5">
                      <span className="min-w-0">
                        <span className="block font-medium">{t(`interviews.modes.${m.mode as "mixed"}`)}</span>
                        <span className="block truncate text-small text-ink-3">{[m.jobs?.title, m.jobs?.company].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-small text-ink-3">{relativeTime(m.created_at, viewer.locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
