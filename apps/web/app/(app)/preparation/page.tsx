import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatDate } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { getViewer } from "@/lib/server/viewer";

const t = getT();
export const metadata: Metadata = { title: t("prep.title") };

export default async function PreparationPage() {
  const viewer = await getViewer();
  const { data } = await viewer.db
    .from("preparation_plans")
    .select("id, title, status, duration_days, personalized, created_at, jobs(id, title, company), preparation_tasks(completed_at)")
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  const plans = (data ?? []) as unknown as {
    id: string;
    title: string;
    status: string;
    duration_days: number;
    personalized: boolean;
    created_at: string;
    jobs: { id: string; title: string | null; company: string | null } | null;
    preparation_tasks: { completed_at: string | null }[];
  }[];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-h1">{t("prep.title")}</h1>
        <p className="mt-2 text-ink-2">{t("prep.lede")}</p>
      </header>
      {plans.length === 0 ? (
        <EmptyState title={t("prep.empty")} body={t("prep.emptyBody")} action={<ButtonLink href="/jobs">{t("nav.jobs")}</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-line border-t border-ink">
          {plans.map((p) => {
            const done = p.preparation_tasks.filter((x) => x.completed_at).length;
            const total = p.preparation_tasks.length;
            return (
              <li key={p.id}>
                <Link href={`/preparation/${p.id}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_14rem] sm:items-center">
                  <span>
                    <span className="block font-medium">{p.title}</span>
                    <span className="block text-small text-ink-3">
                      {[p.jobs?.title, p.jobs?.company].filter(Boolean).join(" · ")} · {formatDate(p.created_at, viewer.locale)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-small text-ink-3">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full bg-ink" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </span>
                    <span className="tnum">{t("prep.progress", { done, total })}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
