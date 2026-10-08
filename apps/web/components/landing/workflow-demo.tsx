"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { useState } from "react";
import { EvidenceTag } from "@/components/ui/evidence";
import { getT } from "@/lib/i18n";

const t = getT();

const STEPS = [
  { key: "read", title: t("landing.step1Title"), body: t("landing.step1Body") },
  { key: "expect", title: t("landing.step2Title"), body: t("landing.step2Body") },
  { key: "match", title: t("landing.step3Title"), body: t("landing.step3Body") },
  { key: "prepare", title: t("landing.step4Title"), body: t("landing.step4Body") },
] as const;

/*
 * The demonstration is deliberately abstract: text is drawn as bars, so it shows the *shape*
 * of the workflow without inventing a company, a job, a score or a statistic.
 */

const POSTING = [
  { w: 72, kind: "heading" },
  { w: 92, kind: "text" },
  { w: 84, kind: "text" },
  { w: 40, kind: "heading" },
  { w: 78, kind: "req" },
  { w: 66, kind: "req" },
  { w: 88, kind: "req" },
  { w: 36, kind: "heading" },
  { w: 58, kind: "pref" },
  { w: 70, kind: "pref" },
] as const;

const MATCH = ["match", "partial", "match", "gap", "match"] as const;

function Bar({ w, tone = "ink", className }: { w: number; tone?: "ink" | "accent" | "caution" | "signal" | "muted"; className?: string }) {
  const tones = { ink: "bg-ink/80", accent: "bg-accent", caution: "bg-caution", signal: "bg-signal", muted: "bg-line-strong" };
  return <div className={clsx("h-2 rounded-full", tones[tone], className)} style={{ width: `${w}%` }} />;
}

export function WorkflowDemo() {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();
  const fade = reduce ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 } };

  return (
    <figure aria-label={t("landing.demoLabel")} className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
      <ol className="flex flex-col" role="tablist" aria-orientation="vertical">
        {STEPS.map((s, i) => (
          <li key={s.key} className="rule-top first:border-t-0">
            <button
              type="button"
              role="tab"
              aria-selected={step === i}
              aria-controls="workflow-panel"
              onClick={() => setStep(i)}
              className={clsx("group flex w-full gap-4 py-5 text-left transition-colors", step === i ? "text-ink" : "text-ink-3 hover:text-ink-2")}
            >
              <span className="font-mono text-meta tnum pt-1">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex flex-col gap-1">
                <span className="text-h3 font-medium">{s.title}</span>
                <span className={clsx("text-small text-ink-2 transition-[opacity,max-height] duration-300", step === i ? "max-h-40 opacity-100" : "max-h-0 overflow-hidden opacity-0 lg:max-h-40 lg:opacity-60")}>{s.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div id="workflow-panel" role="tabpanel" className="relative min-h-[23rem] overflow-hidden rounded-lg border border-line bg-surface p-5 shadow-2 sm:p-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="read" {...fade} transition={{ duration: 0.35 }} className="flex flex-col gap-3">
              <p className="eyebrow">{t("landing.demoPosting")}</p>
              {POSTING.map((l, i) => (
                <motion.div key={i} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : i * 0.04 }}>
                  <Bar w={l.w} tone={l.kind === "heading" ? "ink" : "muted"} className={l.kind === "heading" ? "h-2.5" : ""} />
                </motion.div>
              ))}
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="expect" {...fade} transition={{ duration: 0.35 }} className="flex flex-col gap-3.5">
              <p className="eyebrow">{t("landing.demoRequirements")}</p>
              {POSTING.filter((l) => l.kind === "req" || l.kind === "pref").map((l, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className={clsx("w-20 shrink-0 font-mono text-meta", l.kind === "req" ? "text-ink" : "text-ink-3")}>{l.kind === "req" ? t("workspace.overview.required") : t("workspace.overview.preferred")}</span>
                  <Bar w={l.w} tone="ink" className="flex-1" />
                  <span className="hidden sm:block"><EvidenceTag type="verified" /></span>
                </div>
              ))}
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="match" {...fade} transition={{ duration: 0.35 }} className="flex flex-col gap-3.5">
              <p className="eyebrow">{t("landing.demoCompare")}</p>
              {MATCH.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <Bar w={60 + ((i * 13) % 35)} tone="ink" />
                  <span
                    className={clsx(
                      "w-16 text-center font-mono text-meta",
                      m === "match" && "text-accent",
                      m === "partial" && "text-caution",
                      m === "gap" && "text-signal",
                    )}
                  >
                    {m === "match" ? t("landing.demoMatch") : m === "partial" ? t("landing.demoPartial") : t("landing.demoGap")}
                  </span>
                  {m === "gap" ? <div className="h-2 rounded-full border border-dashed border-signal/60" style={{ width: "70%" }} /> : <Bar w={50 + ((i * 17) % 40)} tone={m === "match" ? "accent" : "caution"} />}
                </div>
              ))}
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="prepare" {...fade} transition={{ duration: 0.35 }} className="flex flex-col gap-4">
              <p className="eyebrow">{t("landing.demoPrep")}</p>
              {[0, 1, 2].map((d) => (
                <div key={d} className="grid grid-cols-[3.5rem_1fr] gap-4">
                  <span className="font-mono text-meta text-ink-3">{t("workspace.preparation.day", { n: d + 1 })}</span>
                  <div className="flex flex-col gap-2 border-l border-line pl-4">
                    <Bar w={70 - d * 8} tone={d === 0 ? "signal" : "ink"} />
                    <Bar w={52 + d * 10} tone="muted" />
                    {d === 2 ? <Bar w={44} tone="accent" /> : null}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <figcaption className="absolute inset-x-5 bottom-4 text-meta text-ink-4 sm:inset-x-8">{t("landing.demoNote")}</figcaption>
      </div>
    </figure>
  );
}
