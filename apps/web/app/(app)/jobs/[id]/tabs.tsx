"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useState } from "react";
import { ApplicationStatus, type InterviewQuestion, type ResearchClaim } from "@elevate/core";
import type { JobWorkspace } from "@/lib/server/services/workspace";
import { Button, ButtonLink } from "@/components/ui/button";
import { EvidenceLegend, EvidenceTag, Quote } from "@/components/ui/evidence";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FactorBar, Score } from "@/components/ui/score";
import { EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate, formatDateTime, formatSalary, humanize, relativeTime } from "@/lib/format";
import { getT } from "@/lib/i18n";

const t = getT();

import type { TabKey } from "./tab-keys";
export { TAB_KEYS, type TabKey } from "./tab-keys";

interface PanelProps {
  ws: JobWorkspace;
  locale: string;
  timezone: string | null;
  running: boolean;
}

export function TabPanel({ tab, ...p }: PanelProps & { tab: TabKey }) {
  switch (tab) {
    case "overview":
      return <Overview {...p} />;
    case "match":
      return <Match {...p} />;
    case "skills":
      return <Skills {...p} />;
    case "ats":
      return <Ats {...p} />;
    case "process":
      return <Process {...p} />;
    case "questions":
      return <Questions {...p} />;
    case "company":
      return <Company {...p} />;
    case "preparation":
      return <Preparation {...p} />;
    case "application":
      return <Application {...p} />;
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Block({ title, children, aside, className }: { title: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("flex flex-col gap-4", className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
        <h2 className="text-h3 font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-line py-3 text-small last:border-0 sm:grid-cols-[11rem_1fr]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

const NotStated = () => <span className="text-ink-4">{t("common.unknown")}</span>;

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, after?: (r: unknown) => void) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (after) after(r);
      else router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function stageReason(ws: JobWorkspace, stage: "requirements" | "research" | "candidate") {
  const s = ws.analysis?.stages?.[stage];
  return s && s.outcome !== "completed" ? s.reason : null;
}


// ---------------------------------------------------------------------------
// At a glance: one honest summary and one obvious next step
// ---------------------------------------------------------------------------

function AtAGlance({ ws }: { ws: JobWorkspace }) {
  const c = ws.candidate;
  const fit = c?.matches ? c.fit : null;
  const reqCount = ws.analysis?.intelligence?.requirements.length ?? 0;
  const topGap = c?.matches?.find((m) => m.status === "gap" && m.importance === "required") ?? c?.matches?.find((m) => m.status !== "match") ?? null;
  const tab = (k: string) => `/jobs/${ws.id}?tab=${k}`;

  let primary: React.ReactNode;
  if (!ws.primaryResume) primary = <ButtonLink href={`/profile?return=${encodeURIComponent(tab("match"))}`}>{t("workspace.glance.ctaResume")}</ButtonLink>;
  else if (!c?.matches) primary = <CompareButton ws={ws} label={t("workspace.glance.ctaCompare")} />;
  else if (ws.plans.length === 0) primary = <ButtonLink href={tab("preparation")}>{t("workspace.glance.ctaPlan")}</ButtonLink>;
  else primary = <ButtonLink href={`/jobs/${ws.id}?practice=1`}>{t("workspace.glance.ctaPractice")}</ButtonLink>;

  return (
    <section aria-label={t("workspace.glance.title")} className="grid gap-6 rounded-lg border border-line bg-surface p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
      <div className="flex items-center gap-4">
        <Score value={fit?.score ?? null} label={t("workspace.glance.fit")} size="sm" />
        <div className="sm:hidden">
          <p className="eyebrow">{t("workspace.glance.fit")}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {fit ? (
          <p className="font-medium text-ink">{fit.recommendation ? t(`workspace.match.recommendation_${fit.recommendation}`) : t("workspace.match.unavailable")}</p>
        ) : (
          <p className="text-ink-2">{ws.primaryResume ? t("workspace.match.needsResumeBody") : t("workspace.glance.noResume")}</p>
        )}
        {fit ? (
          <p className="text-small text-ink-2">
            <span className="text-ink-3">{t("workspace.glance.topGap")}: </span>
            {topGap ? topGap.requirementText : t("workspace.glance.noGaps")}
          </p>
        ) : reqCount ? (
          <p className="text-small text-ink-3">{t("workspace.glance.requirements", { n: reqCount })}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {primary}
          {fit ? (
            <Link href={tab("match")} className="text-small font-medium underline decoration-line-strong underline-offset-4">
              {t("workspace.glance.seeMatch")}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ ws, locale, running }: PanelProps) {
  const j = ws.job;
  const intel = ws.analysis?.intelligence ?? null;
  const cls = ws.analysis?.classification ?? null;
  const required = intel?.requirements.filter((r) => r.importance === "required") ?? [];
  const preferred = intel?.requirements.filter((r) => r.importance === "preferred") ?? [];
  const salary = formatSalary(j.salary, locale);
  const exp = intel?.experienceYears;
  const [showDesc, setShowDesc] = useState(false);

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="flex flex-col gap-12 lg:col-span-8">
        {!running ? <AtAGlance ws={ws} /> : null}
        {intel?.summary ? (
          <section>
            <p className="eyebrow mb-3">{t("workspace.overview.summary")}</p>
            <p className="font-display text-h3 leading-relaxed text-ink">{intel.summary}</p>
            <EvidenceTag type="inferred" className="mt-3" />
          </section>
        ) : null}

        <Block title={t("workspace.overview.requirements")} aside={<EvidenceLegend />}>
          {running && !intel ? (
            <p className="text-small text-ink-3">{t("workspace.status.running")}</p>
          ) : required.length + preferred.length === 0 ? (
            <p className="text-small text-ink-3">{stageReason(ws, "requirements") ?? t("workspace.overview.noRequirements")}</p>
          ) : (
            <div className="flex flex-col gap-8">
              {[
                { label: t("workspace.overview.required"), items: required },
                { label: t("workspace.overview.preferred"), items: preferred },
              ]
                .filter((g) => g.items.length)
                .map((g) => (
                  <div key={g.label}>
                    <p className="eyebrow mb-2">{g.label}</p>
                    <ul className="divide-y divide-line">
                      {g.items.map((r) => (
                        <li key={r.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                          <span>{r.text}</span>
                          <EvidenceTag type={r.evidence.type} origin="job_posting" />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              {intel && intel.droppedUnverified > 0 ? <p className="text-meta text-ink-3">{t("workspace.overview.dropped", { count: intel.droppedUnverified })}</p> : null}
            </div>
          )}
        </Block>

        {j.responsibilities.length ? (
          <Block title={t("workspace.overview.responsibilities")}>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-ink-2 marker:text-ink-4">
              {j.responsibilities.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Block>
        ) : null}

        {intel?.prepTopics.length ? (
          <Block title={t("workspace.overview.prepTopics")}>
            <ul className="divide-y divide-line">
              {intel.prepTopics.map((p, i) => (
                <li key={i} className="flex flex-col gap-1 py-3">
                  <span className="font-medium">{p.topic}</span>
                  <span className="text-small text-ink-2">{p.why}</span>
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        {j.description ? (
          <Block title={t("workspace.overview.description")}>
            <div className={clsx("prose-job relative overflow-hidden text-small", !showDesc && "max-h-72")}>
              {j.description}
              {!showDesc ? <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-paper" /> : null}
            </div>
            <button type="button" onClick={() => setShowDesc((s) => !s)} className="self-start text-small font-medium underline decoration-line-strong underline-offset-4">
              {showDesc ? t("common.showLess") : t("common.showMore")}
            </button>
          </Block>
        ) : null}
      </div>

      <aside className="flex flex-col gap-10 lg:col-span-4">
        <dl>
          <Row label={t("workspace.overview.location")}>{j.location ?? <NotStated />}</Row>
          <Row label={t("workspace.overview.employment")}>{j.employmentType ? humanize(j.employmentType) : <NotStated />}</Row>
          <Row label={t("workspace.overview.experience")}>
            {exp && exp.min !== null ? (exp.max ? t("workspace.overview.yearsRange", { min: exp.min, max: exp.max }) : t("workspace.overview.years", { min: exp.min })) : <NotStated />}
          </Row>
          <Row label={t("workspace.overview.education")}>
            {intel?.education?.minLevel ? `${humanize(intel.education.minLevel)}${intel.education.fields.length ? ` — ${intel.education.fields.join(", ")}` : ""}` : <NotStated />}
          </Row>
          <Row label={t("workspace.overview.salary")}>
            {salary ? (
              <span className="flex flex-col gap-1">
                <span className="tnum">{salary}</span>
                <EvidenceTag type="verified" />
              </span>
            ) : (
              <span className="text-ink-4">{t("workspace.overview.salaryNotListed")}</span>
            )}
          </Row>
        </dl>

        {cls ? (
          <div>
            <p className="eyebrow mb-2">{t("workspace.overview.classification")}</p>
            <dl>
              <Row label={t("workspace.overview.family")}>{cls.jobFamily ?? <NotStated />}</Row>
              <Row label={t("workspace.overview.domain")}>{cls.domain ?? <NotStated />}</Row>
              <Row label={t("workspace.overview.seniority")}>{cls.seniority ? humanize(cls.seniority) : <NotStated />}</Row>
            </dl>
            {cls.rationale ? <p className="mt-2 text-meta text-ink-3">{cls.rationale}</p> : null}
            <EvidenceTag type="inferred" className="mt-2" />
          </div>
        ) : null}

        {j.benefits.length ? (
          <div>
            <p className="eyebrow mb-2">{t("workspace.overview.benefits")}</p>
            <ul className="flex flex-col gap-1.5 text-small text-ink-2">
              {j.benefits.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <EvidenceTag type="verified" className="mt-2" />
          </div>
        ) : null}

        <div className="text-meta text-ink-3">
          <p className="eyebrow mb-2">{t("workspace.overview.extraction")}</p>
          <p>
            {t("workspace.overview.completeness")}: {Math.round((ws.extraction.completeness ?? 0) * 100)}%
          </p>
          <p>{t("common.retrieved", { time: relativeTime(ws.retrievedAt, locale) ?? "" })}</p>
          {(ws.extraction.warnings ?? []).map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

function CompareButton({ ws, label }: { ws: JobWorkspace; label: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button busy={busy} onClick={() => run(() => api(`/api/v1/jobs/${ws.id}/candidate-analysis`, { method: "POST", json: {} }))}>
        {busy ? t("workspace.match.comparing") : label}
      </Button>
      {error ? <p role="alert" className="text-small text-signal">{error}</p> : null}
    </div>
  );
}

function NeedsResume({ ws }: { ws: JobWorkspace }) {
  if (!ws.primaryResume) {
    return (
      <EmptyState
        compact
        title={t("workspace.match.needsResume")}
        body={t("workspace.match.needsResumeBody")}
        action={<ButtonLink href={`/profile?return=/jobs/${ws.id}?tab=match`}>{t("workspace.match.addResume")}</ButtonLink>}
      />
    );
  }
  return <EmptyState compact title={t("workspace.match.title")} body={t("workspace.match.needsResumeBody")} action={<CompareButton ws={ws} label={t("workspace.match.runComparison")} />} />;
}

function StaleResume({ ws }: { ws: JobWorkspace }) {
  if (!ws.candidate || !ws.primaryResume || ws.candidate.resumeVersionId === ws.primaryResume.versionId) return null;
  return (
    <Notice tone="caution" className="flex flex-col items-start gap-2">
      <span>{t("workspace.match.stale")}</span>
      <CompareButton ws={ws} label={t("workspace.match.recompare")} />
    </Notice>
  );
}

function Match({ ws, running }: PanelProps) {
  const c = ws.candidate;
  if (running && !c) return <p className="text-small text-ink-3">{t("workspace.status.running")}</p>;
  if (!c) return <NeedsResume ws={ws} />;
  const fit = c.fit;
  const matches = c.matches ?? [];
  const groups = [
    { key: "match", title: t("workspace.match.matches"), items: matches.filter((m) => m.status === "match"), tone: "text-accent" },
    { key: "partial", title: t("workspace.match.partial"), items: matches.filter((m) => m.status === "partial"), tone: "text-caution" },
    { key: "gap", title: t("workspace.match.gaps"), items: matches.filter((m) => m.status === "gap"), tone: "text-signal" },
  ];
  return (
    <div className="flex flex-col gap-10">
      <StaleResume ws={ws} />
      <section className="grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <p className="eyebrow">{t("workspace.match.fit")}</p>
          <Score value={fit?.score ?? null} label={t("workspace.match.fit")} />
          <p className="text-small text-ink-2">{fit?.recommendation ? t(`workspace.match.recommendation_${fit.recommendation}`) : t("workspace.match.unavailable")}</p>
          {!c.matches ? <p className="text-meta text-ink-3">{stageReason(ws, "candidate")}</p> : null}
          <p className="text-meta text-ink-3">
            {t("workspace.match.resumeVersion", { label: c.resumeLabel ?? "Resume", version: c.resumeVersion ?? "?" })}
          </p>
        </div>
        {fit && fit.components.length ? (
          <details className="lg:col-span-8" open>
            <summary className="cursor-pointer text-small font-medium">{t("workspace.match.howCalculated")}</summary>
            <ul className="mt-4 flex flex-col gap-4">
              {fit.components.map((comp) => (
                <li key={comp.key} className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                  <span className="text-small">
                    {t(`workspace.ats.component_${comp.key}`)} <span className="font-mono text-meta text-ink-3">{t("workspace.ats.weight", { weight: comp.weight })}</span>
                  </span>
                  <span className="flex flex-col gap-1.5">
                    {comp.value === null ? <span className="font-mono text-meta text-ink-4">{t("workspace.ats.notEvaluated")}</span> : <FactorBar value={comp.value} />}
                    <span className="text-meta text-ink-3">{comp.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {matches.length ? (
        <div className="grid gap-10 lg:grid-cols-3">
          {groups.map((g) => (
            <Block key={g.key} title={`${g.title} (${g.items.length})`}>
              <ul className="flex flex-col divide-y divide-line">
                {g.items.length === 0 ? <li className="py-2 text-small text-ink-4">—</li> : null}
                {g.items.map((m) => (
                  <li key={m.requirementId} className="flex flex-col gap-2 py-3">
                    <span className="text-small">
                      <span className={clsx("mr-2 font-mono text-meta uppercase", g.tone)}>{m.importance === "required" ? t("workspace.overview.required") : t("workspace.overview.preferred")}</span>
                      {m.requirementText}
                    </span>
                    {m.resumeQuote ? (
                      <>
                        <Quote>{m.resumeQuote}</Quote>
                        <EvidenceTag type="verified" origin="resume" />
                      </>
                    ) : (
                      <span className="text-meta text-ink-3">{m.downgraded ? t("workspace.match.downgraded") : t("workspace.match.noEvidence")}</span>
                    )}
                    {m.rationale && !m.downgraded ? <span className="text-meta text-ink-3">{m.rationale}</span> : null}
                  </li>
                ))}
              </ul>
            </Block>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

function Skills({ ws, running }: PanelProps) {
  const skills = ws.analysis?.intelligence?.skills ?? [];
  const keywordHits = new Map((ws.candidate?.ats?.keywords ?? []).map((k) => [k.skillId, k]));
  if (running && !skills.length) return <p className="text-small text-ink-3">{t("workspace.status.running")}</p>;
  if (!skills.length) {
    return <EmptyState compact title={t("workspace.skills.none")} body={ws.capabilities.ai ? (stageReason(ws, "requirements") ?? undefined) : t("workspace.skills.aiRequired")} />;
  }
  const groups = (["required", "preferred", "inferred"] as const).map((imp) => ({ imp, items: skills.filter((s) => s.importance === imp) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-10">
      {!ws.candidate ? <Notice>{t("workspace.match.needsResume")}</Notice> : null}
      {groups.map((g) => (
        <Block key={g.imp} title={t(`workspace.skills.${g.imp}`)}>
          <ul className="divide-y divide-line">
            {g.items.map((s) => {
              const hit = keywordHits.get(s.id);
              return (
                <li key={s.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:gap-6">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-medium">
                      {s.name}
                      {s.aliases.length ? <span className="ml-2 font-normal text-ink-3">({s.aliases.join(", ")})</span> : null}
                    </span>
                    {s.evidence.quote ? <Quote>{s.evidence.quote}</Quote> : null}
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <EvidenceTag type={s.evidence.type} origin="job_posting" />
                    {hit ? (
                      <span className={clsx("font-mono text-meta", hit.found ? "text-accent" : "text-signal")}>{hit.found ? t("workspace.skills.inResume") : t("workspace.skills.notInResume")}</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ATS
// ---------------------------------------------------------------------------

function Ats({ ws, running }: PanelProps) {
  const ats = ws.candidate?.ats ?? null;
  if (running && !ats) return <p className="text-small text-ink-3">{t("workspace.status.running")}</p>;
  if (!ats) {
    return ws.primaryResume ? (
      <EmptyState compact title={t("workspace.ats.title")} body={t("workspace.ats.explain")} action={<CompareButton ws={ws} label={t("workspace.match.runComparison")} />} />
    ) : (
      <EmptyState compact title={t("workspace.ats.unavailable")} body={t("workspace.ats.explain")} action={<ButtonLink href="/profile">{t("workspace.match.addResume")}</ButtonLink>} />
    );
  }
  const evaluated = ats.components.filter((c) => c.value !== null).length;
  return (
    <div className="flex flex-col gap-10">
      <StaleResume ws={ws} />
      <section className="grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <p className="eyebrow">{t("workspace.ats.title")}</p>
          <Score value={ats.score} label={t("workspace.ats.title")} />
          <p className="text-meta text-ink-3">{t("workspace.ats.basedOn", { count: evaluated, total: ats.components.length })}</p>
          <p className="text-small text-ink-2">{t("workspace.ats.explain")}</p>
        </div>
        <Block title={t("workspace.ats.components")} className="lg:col-span-8">
          <ul className="flex flex-col gap-5">
            {ats.components.map((c) => (
              <li key={c.key} className="grid gap-2 sm:grid-cols-[14rem_1fr]">
                <span className="text-small">
                  {t(`workspace.ats.component_${c.key}`)} <span className="font-mono text-meta text-ink-3">{t("workspace.ats.weight", { weight: c.weight })}</span>
                </span>
                <span className="flex flex-col gap-1.5">
                  {c.value === null ? <span className="font-mono text-meta text-ink-4">{t("workspace.ats.notEvaluated")}</span> : <FactorBar value={c.value} />}
                  <span className="text-meta text-ink-3">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      </section>
      <div className="grid gap-10 lg:grid-cols-2">
        <Block title={t("workspace.ats.keywords")}>
          {ats.keywords.length === 0 ? (
            <p className="text-small text-ink-3">{t("workspace.skills.none")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {ats.keywords.map((k) => (
                <li key={k.skillId} className="flex items-baseline justify-between gap-4 py-2.5 text-small">
                  <span>
                    {k.name} <span className="font-mono text-meta text-ink-3">{k.importance}</span>
                  </span>
                  <span className={clsx("font-mono text-meta", k.found ? "text-accent" : "text-signal")}>{k.found ? t("workspace.skills.inResume") : t("workspace.skills.notInResume")}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title={t("workspace.ats.format")}>
          <ul className="divide-y divide-line">
            {ats.formatChecks.map((f) => (
              <li key={f.key} className="flex gap-3 py-2.5 text-small">
                <span aria-hidden className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", f.ok ? "bg-accent" : "bg-signal")} />
                <span className="text-ink-2">{f.detail}</span>
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

function SourceLinks({ ids, ws }: { ids: string[]; ws: JobWorkspace }) {
  const sources = (ws.research?.sources ?? []).filter((s) => ids.includes(s.id));
  if (!sources.length) return null;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-meta">
      {sources.map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
          {s.domain} ↗
        </a>
      ))}
    </span>
  );
}

function ClaimItem({ c, ws }: { c: ResearchClaim; ws: JobWorkspace }) {
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <span>{c.text}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <EvidenceTag type={c.evidence.type} origin="research" />
        <SourceLinks ids={c.evidence.sourceIds} ws={ws} />
      </span>
    </li>
  );
}

function Process({ ws, running }: PanelProps) {
  const steps = (ws.research?.claims ?? []).filter((c) => c.kind === "process_step").sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const company = steps.filter((s) => s.scope === "company");
  const similar = steps.filter((s) => s.scope === "role");
  const predicted = ws.analysis?.predicted_process ?? [];
  if (running && !ws.research) return <p className="text-small text-ink-3">{t("workspace.status.running")}</p>;
  return (
    <div className="flex flex-col gap-10">
      <Block title={t("workspace.process.researched")} aside={<EvidenceLegend />}>
        {company.length ? (
          <ol className="divide-y divide-line">
            {company.map((c) => (
              <ClaimItem key={c.id} c={c} ws={ws} />
            ))}
          </ol>
        ) : (
          <p className="text-small text-ink-3">{ws.capabilities.research ? (stageReason(ws, "research") ?? t("workspace.process.none")) : t("workspace.process.noneNoResearch")}</p>
        )}
      </Block>
      {similar.length ? (
        <Block title={t("workspace.questions.similar")}>
          <p className="text-small text-ink-3">{t("workspace.questions.similarHelp")}</p>
          <ol className="divide-y divide-line">
            {similar.map((c) => (
              <ClaimItem key={c.id} c={c} ws={ws} />
            ))}
          </ol>
        </Block>
      ) : null}
      {predicted.length ? (
        <Block title={t("workspace.process.predicted")}>
          <p className="text-small text-ink-3">{t("workspace.process.predictedNote")}</p>
          <ol className="predicted flex flex-col gap-4 pl-5">
            {predicted.map((p, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="font-mono text-meta text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium">{p.step}</span>
                <span className="text-small text-ink-2">{p.description}</span>
              </li>
            ))}
          </ol>
          <EvidenceTag type="predicted" />
        </Block>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

function Questions({ ws, running }: PanelProps) {
  const qs = (ws.analysis?.questions ?? []) as InterviewQuestion[];
  const reqText = new Map((ws.analysis?.intelligence?.requirements ?? []).map((r) => [r.id, r.text]));
  if (running && !qs.length) return <p className="text-small text-ink-3">{t("workspace.status.running")}</p>;
  if (!qs.length) return <EmptyState compact title={t("workspace.questions.none")} body={!ws.capabilities.ai ? t("workspace.skills.aiRequired") : undefined} />;
  const groups = [
    { key: "reported", title: t("workspace.questions.reported"), help: t("workspace.questions.reportedHelp"), items: qs.filter((q) => q.origin === "reported") },
    { key: "similar", title: t("workspace.questions.similar"), help: t("workspace.questions.similarHelp"), items: qs.filter((q) => q.origin === "similar") },
    { key: "predicted", title: t("workspace.questions.predicted"), help: t("workspace.questions.predictedHelp"), items: qs.filter((q) => q.origin === "predicted") },
  ];
  return (
    <div className="flex flex-col gap-10">
      {groups.map((g) => (
        <Block key={g.key} title={`${g.title} (${g.items.length})`}>
          <p className="text-small text-ink-3">{g.help}</p>
          {g.items.length === 0 ? (
            <p className="text-small text-ink-4">{g.key === "reported" ? t("workspace.questions.noneReported") : "—"}</p>
          ) : (
            <ul className={clsx("divide-y divide-line", g.key === "predicted" && "predicted pl-4")}>
              {g.items.map((q) => (
                <li key={q.id} className="flex flex-col gap-1.5 py-3">
                  <span>{q.text}</span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-3">
                    <EvidenceTag type={q.evidence.type} origin={q.evidence.origin} />
                    {q.category ? <span>{humanize(q.category)}</span> : null}
                    <SourceLinks ids={q.evidence.sourceIds} ws={ws} />
                  </span>
                  {q.requirementIds.length ? <span className="text-meta text-ink-3">{t("workspace.questions.relatesTo", { req: q.requirementIds.map((id) => reqText.get(id)).filter(Boolean).join("; ") })}</span> : null}
                  {q.basis && q.origin === "predicted" ? <span className="text-meta text-ink-3">{q.basis}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Block>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

function Company({ ws, locale, running }: PanelProps) {
  const { busy, error, run } = useAction();
  const r = ws.research;
  const claims = r?.claims.filter((c) => c.scope === "company") ?? [];
  const byKind = (k: ResearchClaim["kind"]) => claims.filter((c) => c.kind === k);
  const [now] = useState(() => Date.now());
  const stale = r ? now - new Date(r.retrievedAt).getTime() > 7 * 86_400_000 : false;

  const refresh = (
    <Button variant="secondary" size="sm" busy={busy || running} disabled={!ws.capabilities.research} onClick={() => run(() => api(`/api/v1/jobs/${ws.id}/research`, { method: "POST" }))}>
      {busy || running ? t("workspace.company.refreshing") : t("workspace.company.refresh")}
    </Button>
  );

  if (!ws.job.company) return <EmptyState compact title={t("workspace.company.title")} body={t("workspace.company.companyUnknown")} />;
  if (!ws.capabilities.research && !r) return <EmptyState compact title={t("workspace.company.title")} body={t("workspace.company.unavailable")} />;
  if (running && !r) return <p className="text-small text-ink-3">{t("workspace.status.running")}</p>;

  const sections = [
    { k: "company_fact" as const, title: t("workspace.company.facts") },
    { k: "development" as const, title: t("workspace.company.developments") },
    { k: "culture" as const, title: t("workspace.company.culture") },
    { k: "salary" as const, title: t("workspace.company.salary") },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-ink-3">
          {r ? t("workspace.company.retrievedAt", { time: relativeTime(r.retrievedAt, locale) ?? "" }) : t("workspace.company.none")}
          {stale ? ` · ${t("workspace.company.stale")}` : ""}
          {r?.note ? ` · ${r.note}` : ""}
        </p>
        {refresh}
      </div>
      {error ? <ErrorState message={error} /> : null}
      {claims.length === 0 && r ? <p className="text-small text-ink-3">{t("workspace.company.none")}</p> : null}
      {sections.map((s) =>
        byKind(s.k).length ? (
          <Block key={s.k} title={s.title}>
            {s.k === "salary" ? <p className="text-small text-ink-3">{t("workspace.company.salaryNote")}</p> : null}
            <ul className="divide-y divide-line">
              {byKind(s.k).map((c) => (
                <ClaimItem key={c.id} c={c} ws={ws} />
              ))}
            </ul>
          </Block>
        ) : null,
      )}
      {r?.sources.length ? (
        <Block title={`${t("workspace.company.sources")} (${r.sources.length})`}>
          <ul className="divide-y divide-line">
            {r.sources.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 py-3">
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:underline">
                  {s.title} ↗
                </a>
                <span className="flex flex-wrap gap-x-3 text-meta text-ink-3">
                  <span>{s.domain}</span>
                  <span>{t(`workspace.company.sourceKind_${s.kind}`)}</span>
                  {s.publishedAt ? <span>{formatDate(s.publishedAt, locale)}</span> : null}
                  {s.scope === "role" ? <span>{t("workspace.questions.similar")}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

function Preparation({ ws, locale }: PanelProps) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [days, setDays] = useState<number | "custom">(7);
  const [custom, setCustom] = useState(5);
  const [hours, setHours] = useState(2);
  // Personalized only when a real requirement-by-requirement comparison exists for the current resume.
  const personal = !!ws.candidate?.matches && ws.candidate.resumeVersionId === ws.primaryResume?.versionId;
  const hasIntel = (ws.analysis?.intelligence?.requirements.length ?? 0) > 0;
  const durationDays = days === "custom" ? custom : days;

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <section className="flex flex-col gap-6 lg:col-span-7">
        <h2 className="font-display text-h2">{t("workspace.preparation.create")}</h2>
        <p className="text-ink-2">{t("workspace.preparation.createBody", { personal: personal ? t("workspace.preparation.personalSuffix") : "" })}</p>
        {!ws.capabilities.ai ? <Notice tone="caution">{t("workspace.preparation.aiRequired")}</Notice> : null}
        {!hasIntel ? <Notice tone="caution">{t("workspace.overview.noRequirements")}</Notice> : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-small font-medium">{t("workspace.preparation.duration")}</legend>
          <div className="flex flex-wrap gap-2">
            {([1, 3, 7, 14, "custom"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={clsx("h-10 rounded-sm border px-4 text-small", days === d ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink-3")}
              >
                {d === "custom" ? t("workspace.preparation.custom") : t(`workspace.preparation.d${d}`)}
              </button>
            ))}
          </div>
          {days === "custom" ? (
            <Field label={t("workspace.preparation.customDays")} className="max-w-40">
              {(p) => <Input {...p} type="number" min={1} max={60} value={custom} onChange={(e) => setCustom(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />}
            </Field>
          ) : null}
        </fieldset>
        <Field label={t("workspace.preparation.hours")} className="max-w-40">
          {(p) => <Input {...p} type="number" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(Math.max(0.5, Math.min(12, Number(e.target.value) || 1)))} />}
        </Field>
        <p className="text-small text-ink-3">{personal ? t("workspace.preparation.personalized") : t("workspace.preparation.roleOnly")}</p>
        <div>
          <Button
            size="lg"
            busy={busy}
            disabled={!ws.capabilities.ai || !hasIntel}
            onClick={() =>
              run(
                () => api<{ planId: string }>(`/api/v1/jobs/${ws.id}/preparation`, { method: "POST", json: { durationDays, hoursPerDay: hours }, timeoutMs: 120_000 }),
                (r) => router.push(`/preparation/${(r as { planId: string }).planId}`),
              )
            }
          >
            {busy ? t("workspace.preparation.generating") : t("workspace.preparation.generate")}
          </Button>
        </div>
        {error ? <ErrorState message={error} /> : null}
      </section>
      <aside className="lg:col-span-5">
        <Block title={t("workspace.preparation.existing")}>
          {ws.plans.length === 0 ? (
            <p className="text-small text-ink-3">{t("workspace.preparation.none")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {ws.plans.map((p) => (
                <li key={p.id}>
                  <Link href={`/preparation/${p.id}`} className="flex flex-col gap-1 py-3">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-meta text-ink-3">
                      {t("prep.progress", { done: p.done, total: p.total })} · {formatDate(p.createdAt, locale)} · {p.personalized ? t("workspace.preparation.personalized") : t("workspace.preparation.roleOnly")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

function Application({ ws, locale, timezone }: PanelProps) {
  const app = ws.application;
  const { busy, error, run } = useAction();
  const [notes, setNotes] = useState(app?.notes ?? "");
  const [round, setRound] = useState("");
  const [when, setWhen] = useState("");
  const tz = timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");

  const setStatus = (status: string) => run(() => api(`/api/v1/jobs/${ws.id}/application`, { method: "PUT", json: { status } }));

  if (!app) {
    return (
      <EmptyState
        compact
        title={t("workspace.application.track")}
        action={
          <Button busy={busy} onClick={() => setStatus("interested")}>
            {t("workspace.application.track")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <section className="flex flex-col gap-6 lg:col-span-7">
        <Field label={t("workspace.application.status")} className="max-w-xs">
          {(p) => (
            <Select {...p} value={app.status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
              {ApplicationStatus.options.map((s) => (
                <option key={s} value={s}>
                  {t(`appStatus.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {app.appliedAt ? (
          <p className="text-small text-ink-2">
            {t("workspace.application.appliedOn")}: {formatDate(app.appliedAt, locale)}
          </p>
        ) : null}
        <Field label={t("workspace.application.notes")}>
          {(p) => <Textarea {...p} value={notes} placeholder={t("workspace.application.notesPlaceholder")} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <div>
          <Button variant="secondary" busy={busy} disabled={notes === (app.notes ?? "")} onClick={() => run(() => api(`/api/v1/jobs/${ws.id}/application`, { method: "PUT", json: { notes: notes || null } }))}>
            {t("common.save")}
          </Button>
        </div>
        {error ? <ErrorState message={error} /> : null}

        <Block title={t("workspace.application.interviews")}>
          {app.interviews.length === 0 ? <p className="text-small text-ink-3">{t("workspace.application.none")}</p> : null}
          <ul className="divide-y divide-line">
            {app.interviews.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-4 py-3">
                <span>
                  <span className="block font-medium">{i.round}</span>
                  <span className="font-mono text-small tnum text-ink-2">{formatDateTime(i.scheduled_at, locale, i.timezone)}</span>
                </span>
                <button type="button" className="text-small text-ink-3 hover:text-signal" onClick={() => run(() => api(`/api/v1/interview-sessions/${i.id}`, { method: "DELETE" }))}>
                  {t("common.delete")}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!round.trim() || !when) return;
              run(async () => {
                await api(`/api/v1/applications/${app.id}/interviews`, { method: "POST", json: { round: round.trim(), scheduledAt: new Date(when).toISOString(), timezone: tz } });
                setRound("");
                setWhen("");
              });
            }}
          >
            <Field label={t("workspace.application.round")}>{(p) => <Input {...p} required value={round} placeholder={t("workspace.application.roundPlaceholder")} onChange={(e) => setRound(e.target.value)} />}</Field>
            <Field label={t("workspace.application.when")} help={tz}>{(p) => <Input {...p} required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
            <Button type="submit" variant="secondary" busy={busy} className="sm:mb-6">
              {t("workspace.application.addInterview")}
            </Button>
          </form>
        </Block>
      </section>
      <aside className="lg:col-span-5">
        <Block title={t("workspace.application.history")}>
          <ol className="flex flex-col gap-3 border-l border-line pl-4">
            {app.events.map((e, i) => (
              <li key={i} className="text-small">
                <span className="font-medium">{t(`appStatus.${e.to_status as "applied"}`)}</span>
                <span className="block text-meta text-ink-3">{formatDateTime(e.created_at, locale, timezone)}</span>
              </li>
            ))}
          </ol>
        </Block>
        {ws.job.applicationUrl ?? ws.job.canonicalUrl ? (
          <a href={(ws.job.applicationUrl ?? ws.job.canonicalUrl)!} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block text-small font-medium underline decoration-line-strong underline-offset-4">
            {t("workspace.application.openPosting")} ↗
          </a>
        ) : null}
      </aside>
    </div>
  );
}
