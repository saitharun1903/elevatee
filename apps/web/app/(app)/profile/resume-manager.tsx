"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useRef, useState } from "react";
import type { ParsedResume } from "@elevate/core";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/format";
import { getT } from "@/lib/i18n";

const t = getT();

export interface ResumeItem {
  id: string;
  label: string;
  is_primary: boolean;
  updated_at: string;
  resume_versions: {
    id: string;
    version: number;
    source_type: "pdf" | "docx" | "text";
    file_name: string | null;
    storage_key: string | null;
    parse_status: "pending" | "parsed" | "text_only" | "failed";
    parsed: ParsedResume | null;
    parse_warnings: string[];
    created_at: string;
  }[];
}

function Uploader({ resumeId, onDone, compact }: { resumeId?: string; onDone: () => void; compact?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (resumeId) form.set("resumeId", resumeId);
      if (label.trim()) form.set("label", label.trim());
      // The API client sets JSON headers only for json bodies; FormData gets its own boundary.
      await api("/api/v1/resumes", { method: "POST", body: form, timeoutMs: 120_000 });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/resumes", { method: "POST", json: { text, ...(label.trim() ? { label: label.trim() } : {}), ...(resumeId ? { resumeId } : {}) }, timeoutMs: 120_000 });
      setText("");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={clsx("flex flex-col gap-4", !compact && "rounded-md border border-dashed border-line-strong p-5")}>
      <div className="flex gap-4 text-small">
        <button type="button" onClick={() => setMode("file")} aria-pressed={mode === "file"} className={mode === "file" ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}>
          {t("profile.upload")}
        </button>
        <button type="button" onClick={() => setMode("text")} aria-pressed={mode === "text"} className={mode === "text" ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}>
          {t("profile.paste")}
        </button>
      </div>
      {!resumeId ? (
        <Field label={t("profile.label")} className="max-w-sm">
          {(p) => <Input {...p} value={label} placeholder={t("profile.labelPlaceholder")} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
      ) : null}
      {mode === "file" ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            id={`file-${resumeId ?? "new"}`}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <label htmlFor={`file-${resumeId ?? "new"}`} className={clsx("inline-flex h-10 cursor-pointer items-center rounded-sm bg-ink px-4 text-[0.9375rem] font-medium text-paper hover:bg-ink-2", busy && "pointer-events-none opacity-50")}>
            {busy ? t("profile.uploading") : resumeId ? t("profile.addVersion") : t("profile.upload")}
          </label>
          <span className="text-meta text-ink-3">{t("profile.uploadHelp")}</span>
        </div>
      ) : (
        <form onSubmit={submitText} className="flex flex-col gap-3">
          <Field label={t("profile.pasteLabel")}>{(p) => <Textarea {...p} required minLength={200} value={text} onChange={(e) => setText(e.target.value)} className="min-h-56" />}</Field>
          <div>
            <Button type="submit" busy={busy}>
              {busy ? t("profile.uploading") : t("common.save")}
            </Button>
          </div>
        </form>
      )}
      {error ? <ErrorState message={error} /> : null}
    </div>
  );
}

function ParsedView({ p }: { p: ParsedResume }) {
  return (
    <div className="grid gap-6 text-small sm:grid-cols-2">
      {p.skills.length ? (
        <div>
          <p className="eyebrow mb-2">{t("profile.skills")}</p>
          <p className="text-ink-2">{p.skills.join(" · ")}</p>
        </div>
      ) : null}
      {p.experience.length ? (
        <div>
          <p className="eyebrow mb-2">{t("profile.experience")}</p>
          <ul className="flex flex-col gap-1.5 text-ink-2">
            {p.experience.map((e, i) => (
              <li key={i}>
                {[e.title, e.organization].filter(Boolean).join(" — ")}
                <span className="ml-2 font-mono text-meta text-ink-3">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
                {e.uncertain ? <span className="ml-2 text-meta text-caution">{t("profile.uncertain")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.education.length ? (
        <div>
          <p className="eyebrow mb-2">{t("profile.education")}</p>
          <ul className="flex flex-col gap-1.5 text-ink-2">
            {p.education.map((e, i) => (
              <li key={i}>
                {[e.credential, e.institution].filter(Boolean).join(" — ")}
                {e.uncertain ? <span className="ml-2 text-meta text-caution">{t("profile.uncertain")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.certifications.length ? (
        <div>
          <p className="eyebrow mb-2">{t("profile.certifications")}</p>
          <p className="text-ink-2">{p.certifications.join(" · ")}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ResumeManager({ resumes, locale, storage, aiAvailable, returnTo }: { resumes: ResumeItem[]; locale: string; storage: boolean; aiAvailable: boolean; returnTo: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(resumes[0]?.resume_versions[0]?.id ?? null);
  const refresh = () => router.refresh();

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function download(versionId: string) {
    setError(null);
    try {
      const { url } = await api<{ url: string }>(`/api/v1/resume-versions/${versionId}/file`);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-h2">{t("profile.resumes")}</h2>
        <p className="mt-2 max-w-prose text-small text-ink-2">{t("profile.resumesLede")}</p>
      </div>
      {returnTo && resumes.length ? (
        <Notice tone="accent">
          <Link href={returnTo} className="font-medium underline underline-offset-4">
            {t("common.continue")} →
          </Link>
        </Notice>
      ) : null}
      {error ? <ErrorState message={error} /> : null}

      {resumes.length === 0 ? (
        <>
          <EmptyState compact title={t("profile.empty")} body={t("profile.emptyBody")} />
          <Uploader onDone={refresh} />
        </>
      ) : (
        <>
          {resumes.map((r) => (
            <article key={r.id} className="border-t border-ink pt-4">
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-h3 font-medium">
                  {r.label}
                  {r.is_primary ? <span className="ml-3 font-mono text-meta uppercase tracking-wider text-accent">{t("profile.primary")}</span> : null}
                </h3>
                <div className="flex gap-2">
                  {!r.is_primary ? (
                    <Button variant="ghost" size="sm" onClick={() => act(() => api(`/api/v1/resumes/${r.id}`, { method: "PATCH", json: { primary: true } }))}>
                      {t("profile.makePrimary")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-signal"
                    onClick={() => window.confirm(t("common.confirmDelete")) && act(() => api(`/api/v1/resumes/${r.id}`, { method: "DELETE" }))}
                  >
                    {t("profile.deleteResume")}
                  </Button>
                </div>
              </header>
              <ul className="mt-3 divide-y divide-line">
                {r.resume_versions.map((v) => (
                  <li key={v.id} className="py-3">
                    <button type="button" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id} className="flex w-full flex-wrap items-baseline justify-between gap-3 text-left">
                      <span>
                        <span className="font-mono text-small">{t("profile.version", { n: v.version })}</span>
                        <span className="ml-3 text-small text-ink-2">{v.file_name ?? v.source_type.toUpperCase()}</span>
                      </span>
                      <span className="flex items-center gap-3 text-meta text-ink-3">
                        <span className={clsx(v.parse_status === "parsed" ? "text-accent" : v.parse_status === "failed" ? "text-signal" : "text-caution")}>
                          {v.parse_status === "parsed" ? t("profile.parsed") : v.parse_status === "failed" ? t("profile.failed") : t("profile.textOnly")}
                        </span>
                        {formatDate(v.created_at, locale)}
                      </span>
                    </button>
                    {open === v.id ? (
                      <div className="mt-4 flex flex-col gap-4">
                        {v.parsed && v.parse_status === "parsed" ? <ParsedView p={v.parsed} /> : !aiAvailable && v.parse_warnings.length === 0 ? <p className="text-small text-ink-3">{t("profile.textOnlyHelp")}</p> : null}
                        {v.parse_warnings.length ? (
                          <div className="text-meta text-ink-3">
                            <p className="eyebrow mb-1">{t("profile.warnings")}</p>
                            {v.parse_warnings.map((w, i) => (
                              <p key={i}>{w}</p>
                            ))}
                          </div>
                        ) : null}
                        {v.source_type !== "text" ? (
                          v.storage_key ? (
                            <button type="button" onClick={() => download(v.id)} className="self-start text-small font-medium underline decoration-line-strong underline-offset-4">
                              {t("profile.download")}
                            </button>
                          ) : (
                            <p className="text-meta text-ink-3">{storage ? null : t("profile.noFile")}</p>
                          )
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <Uploader resumeId={r.id} onDone={refresh} compact />
              </div>
            </article>
          ))}
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-small font-medium">{t("profile.newResume")}</summary>
            <div className="mt-4">
              <Uploader onDone={refresh} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
