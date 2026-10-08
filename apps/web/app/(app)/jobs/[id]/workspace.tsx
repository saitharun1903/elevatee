"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { isTerminal, type StageName } from "@elevate/core";
import type { JobWorkspace } from "@/lib/server/services/workspace";
import { Button, buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate, humanize } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { useAnalysisStream } from "./use-analysis-stream";
import { TabPanel } from "./tabs";
import { TAB_KEYS, type TabKey } from "./tab-keys";
import { PracticeDialog } from "./practice-dialog";

const t = getT();

export interface WorkspaceProps {
  ws: JobWorkspace;
  tab: TabKey;
  locale: string;
  timezone: string | null;
  openPractice?: boolean;
}

const STAGE_ORDER: StageName[] = ["extraction", "classification", "requirements", "research", "candidate", "ats", "fit"];
const STAGE_LABEL: Record<StageName, string> = {
  extraction: t("workspace.progress.extraction"),
  classification: t("workspace.progress.classification"),
  requirements: t("workspace.progress.requirements"),
  research: t("workspace.progress.research"),
  candidate: t("workspace.progress.candidate"),
  ats: t("workspace.progress.ats"),
  fit: t("workspace.progress.fit"),
};

function AnalysisProgress({ live }: { live: ReturnType<typeof useAnalysisStream> }) {
  const reduce = useReducedMotion();
  // Only stages the backend has actually reported are shown.
  const reported = STAGE_ORDER.filter((s) => live.stages[s]);
  return (
    <section aria-live="polite" aria-label={t("workspace.progress.title")} className="rule-top py-6">
      <p className="eyebrow mb-4">{t("workspace.progress.title")}</p>
      <ol className="flex flex-col gap-2.5">
        {reported.map((s) => {
          const st = live.stages[s]!;
          return (
            <motion.li key={s} initial={reduce ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex items-baseline gap-3 text-small">
              <span
                aria-hidden
                className={clsx(
                  "inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full",
                  st.outcome === "completed" && "bg-accent",
                  st.outcome === "running" && "bg-ink",
                  (st.outcome === "failed" || st.outcome === "timeout") && "bg-signal",
                  (st.outcome === "skipped" || st.outcome === "unavailable") && "border border-ink-4",
                )}
              />
              <span className={clsx(st.outcome === "running" ? "text-ink" : "text-ink-2")}>{STAGE_LABEL[s]}</span>
              <span className="font-mono text-meta text-ink-3">{t(`workspace.progress.outcome_${st.outcome}`)}</span>
              {st.reason && st.outcome !== "completed" ? <span className="hidden text-meta text-ink-3 md:inline">— {st.reason}</span> : null}
            </motion.li>
          );
        })}
        {live.status === "FINALIZING" ? <li className="text-small text-ink-2">{t("workspace.progress.finalizing")}</li> : null}
      </ol>
      {live.connection === "lost" ? <Notice tone="caution" className="mt-4">{t("workspace.progress.connectionLost")}</Notice> : null}
    </section>
  );
}

function StatusLine({ ws, live }: { ws: JobWorkspace; live: ReturnType<typeof useAnalysisStream> }) {
  if (!live.status || !isTerminal(live.status) || live.status === "COMPLETED") return null;
  const failedStages = STAGE_ORDER.map((s) => [s, live.stages[s]] as const).filter(([, st]) => st && ["failed", "timeout", "unavailable"].includes(st.outcome));
  return (
    <Notice tone={live.status === "PARTIAL" ? "caution" : "signal"} className="mt-6">
      <p className="font-medium text-ink">{t(`workspace.status.${live.status as "PARTIAL" | "FAILED" | "TIMEOUT"}`)}</p>
      <p className="mt-1">{live.status === "PARTIAL" ? t("workspace.status.partialHelp") : (live.error?.message ?? ws.analysis?.error?.message)}</p>
      {failedStages.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-meta font-medium text-ink-2">{t("workspace.status.whatFailed", { n: failedStages.length })}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {failedStages.map(([s, st]) => (
              <li key={s} className="text-meta">
                <span className="font-medium text-ink-2">{STAGE_LABEL[s]}:</span> {st!.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Notice>
  );
}

export function Workspace({ ws, tab, locale, timezone, openPractice }: WorkspaceProps) {
  const router = useRouter();
  const live = useAnalysisStream(ws.id, ws.analysis?.id ?? null, {
    status: ws.analysis?.status ?? null,
    stages: ws.analysis?.stages ?? {},
    error: ws.analysis?.error ?? null,
  });
  const running = !!live.status && !isTerminal(live.status);
  const [saved, setSaved] = useState(ws.saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(!!openPractice && !!ws.analysis?.intelligence && !!ws.capabilities.ai);
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  const j = ws.job;

  async function act(key: string, fn: () => Promise<unknown>, refresh = true) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      if (refresh) router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const toggleSave = () =>
    act("save", async () => {
      await api(`/api/v1/jobs/${ws.id}/save`, { method: saved ? "DELETE" : "POST" });
      setSaved(!saved);
    }, false);

  const applyUrl = j.applicationUrl ?? j.canonicalUrl;
  const onApply = () =>
    act("apply", async () => {
      if (applyUrl) window.open(applyUrl, "_blank", "noopener,noreferrer");
      if (!ws.application || ws.application.status === "interested") {
        await api(`/api/v1/jobs/${ws.id}/application`, { method: "PUT", json: { status: "applied" } });
      }
    });

  const meta = [
    j.location,
    j.workplaceType ? t(`workspace.meta.workplace_${j.workplaceType}`) : null,
    j.employmentType ? humanize(j.employmentType) : null,
    j.postedAt ? t("workspace.meta.postedAt", { date: formatDate(j.postedAt, locale) ?? "" }) : null,
  ].filter(Boolean);

  const tabHref = (k: TabKey) => (k === "overview" ? `/jobs/${ws.id}` : `/jobs/${ws.id}?tab=${k}`);

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-5 pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-3">
          <Link href="/jobs" className="hover:text-ink">
            ← {t("nav.jobs")}
          </Link>
          <span aria-hidden>/</span>
          <span>{t(`workspace.meta.capturedVia_${ws.capturedVia}`)}</span>
          {ws.application ? (
            <>
              <span aria-hidden>/</span>
              <span className="font-mono text-meta uppercase tracking-wider text-ink">{t(`appStatus.${ws.application.status as "applied"}`)}</span>
            </>
          ) : null}
          {ws.archived ? (
            <>
              <span aria-hidden>/</span>
              <span>{t("jobs.tabArchived")}</span>
            </>
          ) : null}
        </div>
        <div>
          <p className="text-h3 text-ink-2">{j.company ?? <span className="text-ink-3">{t("jobs.companyUnknown")}</span>}</p>
          <h1 className="mt-1 font-display text-h1">{j.title ?? t("jobs.titleUnknown")}</h1>
          {meta.length ? <p className="mt-3 text-ink-2">{meta.join(" · ")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {ws.application && ws.application.status !== "interested" ? (
            applyUrl ? (
              <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                {t("workspace.actions.applied")} ↗
              </a>
            ) : (
              <Link href={tabHref("application")} className={buttonClass("secondary")}>
                {t("workspace.actions.applied")}
              </Link>
            )
          ) : (
            <Button onClick={onApply} busy={busy === "apply"}>
              {t("workspace.actions.apply")}
            </Button>
          )}
          <Button variant="secondary" onClick={toggleSave} busy={busy === "save"} aria-pressed={saved}>
            {saved ? t("workspace.actions.saved") : t("workspace.actions.save")}
          </Button>
          <Link href={tabHref("preparation")} className={buttonClass("secondary")}>
            {t("workspace.actions.prepare")}
          </Link>
          <Button variant="secondary" onClick={() => setPracticeOpen(true)} disabled={!ws.analysis?.intelligence || !ws.capabilities.ai}>
            {t("workspace.actions.practice")}
          </Button>
          <details className="relative">
            <summary className={buttonClass("ghost", "md", "list-none [&::-webkit-details-marker]:hidden")} aria-label="More actions">
              •••
            </summary>
            <div className="absolute left-0 top-11 z-20 w-56 rounded-md border border-line bg-raised p-1.5 shadow-3 sm:left-auto sm:right-0">
              <button type="button" disabled={running} onClick={() => act("rerun", () => api(`/api/v1/jobs/${ws.id}/analysis`, { method: "POST" }))} className="block w-full rounded-sm px-3 py-2 text-left text-small hover:bg-sunken disabled:opacity-50">
                {t("workspace.actions.reanalyze")}
              </button>
              <button type="button" onClick={() => act("archive", () => api(`/api/v1/jobs/${ws.id}`, { method: "PATCH", json: { archived: !ws.archived } }))} className="block w-full rounded-sm px-3 py-2 text-left text-small hover:bg-sunken">
                {ws.archived ? t("workspace.actions.unarchive") : t("workspace.actions.archive")}
              </button>
              {j.canonicalUrl ? (
                <a href={j.canonicalUrl} target="_blank" rel="noopener noreferrer" className="block rounded-sm px-3 py-2 text-small hover:bg-sunken">
                  {t("workspace.actions.viewPosting")} ↗
                </a>
              ) : null}
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(t("common.confirmDelete"))) return;
                  act("delete", async () => {
                    await api(`/api/v1/jobs/${ws.id}`, { method: "DELETE" });
                    router.replace("/jobs");
                  }, false);
                }}
                className="block w-full rounded-sm px-3 py-2 text-left text-small text-signal hover:bg-signal-soft"
              >
                {t("workspace.actions.delete")}
              </button>
            </div>
          </details>
        </div>
        {actionError ? <p role="alert" className="text-small text-signal">{actionError}</p> : null}
      </header>

      {running ? <AnalysisProgress live={live} /> : null}
      <StatusLine ws={ws} live={live} />

      <nav ref={tabsRef} aria-label="Job sections" className="sticky top-14 z-20 -mx-4 mt-6 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-paper/95 px-4 backdrop-blur sm:-mx-8 sm:px-8">
        <ul className="flex min-w-max gap-6">
          {TAB_KEYS.map((k) => (
            <li key={k}>
              <Link href={tabHref(k)} scroll={false} aria-current={tab === k ? "page" : undefined} className={clsx("-mb-px block border-b-2 py-3 text-[0.9375rem] transition-colors", tab === k ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
                {t(`workspace.tabs.${k}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pt-8">
        <TabPanel tab={tab} ws={ws} locale={locale} timezone={timezone} running={running} />
      </div>

      <PracticeDialog open={practiceOpen} onClose={() => setPracticeOpen(false)} jobId={ws.id} isTechnical={ws.analysis?.classification?.isTechnical ?? null} />
    </div>
  );
}
