"use client";

import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ErrorState, Notice } from "@/components/ui/states";
import { api, ApiClientError } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

type Mode = "url" | "text";

export function AnalyzeForm({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [extra, setExtra] = useState({ title: "", company: "", location: "", url: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const body =
        mode === "url"
          ? { source: "url", url: url.trim() }
          : {
              source: "text",
              text,
              ...(extra.title.trim() ? { title: extra.title.trim() } : {}),
              ...(extra.company.trim() ? { company: extra.company.trim() } : {}),
              ...(extra.location.trim() ? { location: extra.location.trim() } : {}),
              ...(extra.url.trim() ? { url: extra.url.trim() } : {}),
            };
      const res = await api<{ jobId: string; deduplicated: boolean }>("/api/v1/jobs/analyze", { method: "POST", json: body, timeoutMs: 45_000 });
      if (res.deduplicated) setNote(t("analyze.duplicate"));
      router.push(`/jobs/${res.jobId}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiClientError ? { code: err.code, message: err.message } : { code: "unknown", message: t("common.errorGeneric") });
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={clsx("-mb-px border-b-2 px-1 pb-3 text-[0.9375rem] transition-colors", mode === m ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink")}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div role="tablist" className="flex gap-6 border-b border-line">
        {tab("url", t("analyze.tabUrl"))}
        {tab("text", t("analyze.tabText"))}
      </div>

      {mode === "url" ? (
        <Field label={t("analyze.urlLabel")} help={t("analyze.urlHelp")}>
          {(p) => <Input {...p} type="url" required inputMode="url" placeholder={t("analyze.urlPlaceholder")} value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />}
        </Field>
      ) : (
        <div className="flex flex-col gap-5">
          <Field label={t("analyze.textLabel")} help={t("analyze.textHelp")}>
            {(p) => <Textarea {...p} required minLength={80} value={text} onChange={(e) => setText(e.target.value)} className="min-h-72" autoFocus />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("analyze.optionalTitle")}>{(p) => <Input {...p} value={extra.title} onChange={(e) => setExtra({ ...extra, title: e.target.value })} />}</Field>
            <Field label={t("analyze.optionalCompany")}>{(p) => <Input {...p} value={extra.company} onChange={(e) => setExtra({ ...extra, company: e.target.value })} />}</Field>
            <Field label={t("analyze.optionalLocation")}>{(p) => <Input {...p} value={extra.location} onChange={(e) => setExtra({ ...extra, location: e.target.value })} />}</Field>
            <Field label={t("analyze.optionalUrl")}>{(p) => <Input {...p} type="url" value={extra.url} onChange={(e) => setExtra({ ...extra, url: e.target.value })} />}</Field>
          </div>
        </div>
      )}

      {error?.code === "page_blocked" ? (
        <div className="flex flex-col items-start gap-3 border-l-2 border-caution py-1 pl-4">
          <p className="font-medium">{t("analyze.blockedTitle")}</p>
          <p className="text-small text-ink-2">{error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => { setMode("text"); setError(null); setExtra((x) => ({ ...x, url })); }}>
            {t("analyze.switchToPaste")}
          </Button>
        </div>
      ) : error ? (
        <ErrorState message={error.message} />
      ) : null}
      {note ? <Notice>{note}</Notice> : null}

      <div>
        <Button type="submit" size="lg" busy={busy}>
          {busy ? t("analyze.submitting") : t("analyze.submit")}
        </Button>
      </div>
    </form>
  );
}
