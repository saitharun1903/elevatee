import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { ApplicationStatus } from "@elevate/core";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { JobListQuery, listJobs } from "@/lib/server/services/jobs";
import { getViewer } from "@/lib/server/viewer";

const t = getT();
export const metadata: Metadata = { title: t("jobs.title") };

const VIEWS = [
  { key: "all", label: t("jobs.tabAll") },
  { key: "saved", label: t("jobs.tabSaved") },
  { key: "applications", label: t("jobs.tabApplications") },
  { key: "archived", label: t("jobs.tabArchived") },
] as const;

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const q = JobListQuery.parse({ view: sp.view, q: sp.q || undefined, sort: sp.sort, status: sp.status || undefined, limit: 100 });
  const jobs = await listJobs(viewer.db, q);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: q.view, q: q.q, sort: q.sort, status: q.status, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "view" && v === "all") && !(k === "sort" && v === "recent")) p.set(k, v);
    const s = p.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };
  const emptyCopy = { all: t("jobs.emptyBody"), saved: t("jobs.emptySaved"), applications: t("jobs.emptyApplications"), archived: t("jobs.emptyArchived") }[q.view];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-h1">{t("jobs.title")}</h1>
        <ButtonLink href="/analyze">{t("nav.analyze")}</ButtonLink>
      </header>

      <nav aria-label={t("jobs.title")} className="-mx-4 overflow-x-auto overflow-y-hidden px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-6 border-b border-line">
          {VIEWS.map((v) => (
            <li key={v.key}>
              <Link href={qs({ view: v.key, status: undefined })} aria-current={q.view === v.key ? "page" : undefined} className={clsx("-mb-px block border-b-2 pb-3 text-[0.9375rem]", q.view === v.key ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
                {v.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form action="/jobs" className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem_auto]">
        {q.view !== "all" ? <input type="hidden" name="view" value={q.view} /> : null}
        <label className="sr-only" htmlFor="jobs-q">
          {t("jobs.searchPlaceholder")}
        </label>
        <Input id="jobs-q" name="q" defaultValue={q.q ?? ""} placeholder={t("jobs.searchPlaceholder")} />
        <label className="sr-only" htmlFor="jobs-status">
          {t("jobs.filterStatus")}
        </label>
        <Select id="jobs-status" name="status" defaultValue={q.status ?? ""}>
          <option value="">{t("jobs.filterAll")}</option>
          {ApplicationStatus.options.map((s) => (
            <option key={s} value={s}>
              {t(`appStatus.${s}`)}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="jobs-sort">
          {t("jobs.sort")}
        </label>
        <Select id="jobs-sort" name="sort" defaultValue={q.sort}>
          <option value="recent">{t("jobs.sortRecent")}</option>
          <option value="posted">{t("jobs.sortPosted")}</option>
          <option value="company">{t("jobs.sortCompany")}</option>
          <option value="fit">{t("jobs.sortFit")}</option>
        </Select>
        <button type="submit" className="h-11 rounded-sm border border-line-strong px-4 text-small hover:border-ink-3">
          {t("nav.search")}
        </button>
      </form>

      {jobs.length === 0 ? (
        q.q || q.status ? (
          <p className="py-10 text-ink-3">{t("jobs.noResults")}</p>
        ) : (
          <EmptyState title={t("jobs.emptyTitle")} body={emptyCopy} action={q.view === "all" ? <ButtonLink href="/analyze">{t("nav.analyze")}</ButtonLink> : undefined} />
        )
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden w-full border-collapse text-left md:table">
            <thead>
              <tr className="border-b border-ink text-meta uppercase tracking-wider text-ink-3">
                <th scope="col" className="py-2 pr-4 font-normal">{t("jobs.colRole")}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t("jobs.colLocation")}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t("jobs.colStatus")}</th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">{t("jobs.colFit")}</th>
                <th scope="col" className="py-2 text-right font-normal">{t("jobs.colAdded")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="group border-b border-line align-baseline hover:bg-surface">
                  <td className="py-3.5 pr-4">
                    <Link href={`/jobs/${j.id}`} className="font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
                      {j.title ?? t("jobs.titleUnknown")}
                    </Link>
                    <span className="block text-small text-ink-3">{j.company ?? t("jobs.companyUnknown")}</span>
                  </td>
                  <td className="py-3.5 pr-4 text-small text-ink-2">{j.location ?? "—"}</td>
                  <td className="py-3.5 pr-4 text-small">{j.applicationStatus ? t(`appStatus.${j.applicationStatus as "applied"}`) : <span className="text-ink-4">—</span>}</td>
                  <td className="py-3.5 pr-4 text-right font-mono text-small tnum">{j.fitScore ?? <span className="text-ink-4">—</span>}</td>
                  <td className="py-3.5 text-right text-small text-ink-3 tnum">{formatDate(j.createdAt, viewer.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile list */}
          <ul className="divide-y divide-line md:hidden">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="flex items-start justify-between gap-4 py-4">
                  <span className="min-w-0">
                    <span className="block font-medium">{j.title ?? t("jobs.titleUnknown")}</span>
                    <span className="block text-small text-ink-3">{[j.company ?? t("jobs.companyUnknown"), j.location].filter(Boolean).join(" · ")}</span>
                    {j.applicationStatus ? <span className="mt-1 block text-meta uppercase tracking-wider text-ink-2">{t(`appStatus.${j.applicationStatus as "applied"}`)}</span> : null}
                  </span>
                  <span className="font-mono text-small tnum text-ink-2">{j.fitScore ?? "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
