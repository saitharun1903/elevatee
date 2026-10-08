"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import type { AnswerFeedback } from "@elevate/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { EvidenceTag } from "@/components/ui/evidence";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

export interface SessionData {
  id: string;
  job_id: string;
  mode: string;
  status: "active" | "completed" | "abandoned";
  summary: { overall: string; strengths: string[]; improvements: string[] } | null;
  jobs: { id: string; title: string | null; company: string | null } | null;
  mock_interview_turns: { id: string; seq: number; role: "interviewer" | "candidate"; content: string; feedback: AnswerFeedback | null }[];
  questionCount: number;
  contextSummary: { gaps: number; reported: number };
}

function Feedback({ f }: { f: AnswerFeedback }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-l-2 border-line-strong pl-4 text-small">
      <span className="flex items-center gap-3">
        <span className="eyebrow">{t("interviews.feedback")}</span>
        {f.rating ? <span className="font-mono text-meta tnum">{t("interviews.rating", { n: f.rating })}</span> : null}
        <EvidenceTag type="inferred" />
      </span>
      {f.strengths.length ? (
        <div>
          <p className="text-ink-3">{t("interviews.strengths")}</p>
          <ul className="list-disc pl-5 text-ink-2">{f.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      {f.improvements.length ? (
        <div>
          <p className="text-ink-3">{t("interviews.improvements")}</p>
          <ul className="list-disc pl-5 text-ink-2">{f.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export function InterviewSession({ initial }: { initial: SessionData }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const s = initial;
  const turns = s.mock_interview_turns;
  const asked = turns.filter((x) => x.role === "interviewer").length;
  const awaitingAnswer = s.status === "active" && turns.at(-1)?.role === "interviewer";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/mock-interviews/${s.id}/answer`, { method: "POST", json: { answer }, timeoutMs: 60_000 });
      setAnswer("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      await api(`/api/v1/mock-interviews/${s.id}/end`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        {s.jobs ? (
          <Link href={`/jobs/${s.jobs.id}`} className="text-small text-ink-3 hover:text-ink">
            ← {[s.jobs.title, s.jobs.company].filter(Boolean).join(" · ")}
          </Link>
        ) : null}
        <h1 className="font-display text-h1">{t(`interviews.modes.${s.mode as "mixed"}`)}</h1>
        <p className="text-small text-ink-3">
          {t("interviews.contextNote", { gaps: s.contextSummary.gaps ? t("interviews.contextGaps") : "", research: s.contextSummary.reported ? t("interviews.contextResearch") : "" })} ·{" "}
          {s.status === "active" ? t("interviews.questionOf", { n: asked, total: s.questionCount }) : t(`interviews.${s.status}`)}
        </p>
      </header>

      <ol className="flex flex-col gap-6">
        {turns.map((turn) => (
          <li key={turn.id} className={clsx("flex flex-col", turn.role === "candidate" && "pl-6 sm:pl-16")}>
            <span className="eyebrow mb-1">{turn.role === "interviewer" ? t("interviews.interviewer") : t("interviews.you")}</span>
            <p className={clsx("whitespace-pre-line", turn.role === "interviewer" ? "font-display text-h3" : "text-ink-2")}>{turn.content}</p>
            {turn.feedback ? <Feedback f={turn.feedback} /> : null}
          </li>
        ))}
      </ol>

      {s.summary ? (
        <section className="rule-top flex flex-col gap-3 pt-6">
          <h2 className="font-display text-h2">{t("interviews.summary")}</h2>
          <p className="text-ink-2">{s.summary.overall}</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="eyebrow mb-2">{t("interviews.strengths")}</p>
              <ul className="list-disc pl-5 text-small text-ink-2">{s.summary.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div>
              <p className="eyebrow mb-2">{t("interviews.improvements")}</p>
              <ul className="list-disc pl-5 text-small text-ink-2">{s.summary.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        </section>
      ) : null}

      {awaitingAnswer ? (
        <form onSubmit={send} className="sticky bottom-20 flex flex-col gap-3 border-t border-line bg-paper pb-2 pt-4 md:bottom-0">
          <label htmlFor="answer" className="sr-only">
            {t("interviews.answerPlaceholder")}
          </label>
          <Textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("interviews.answerPlaceholder")} maxLength={6000} disabled={busy} />
          {error ? <ErrorState message={error} /> : null}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={end} disabled={busy}>
              {t("interviews.end")}
            </Button>
            <Button type="submit" busy={busy} disabled={!answer.trim()}>
              {busy ? t("interviews.sending") : t("interviews.send")}
            </Button>
          </div>
        </form>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
