"use client";

import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

interface Hit {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
}

/** Global job search (⌘K). Searches the user's own jobs on the server. */
export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await api<{ jobs: Hit[] }>(`/api/v1/jobs?q=${encodeURIComponent(q.trim())}&limit=8`, { signal: ctrl.signal });
        setHits(res.jobs);
        setActive(0);
        setState("idle");
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setErr(errorMessage(e));
          setState("error");
        }
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, open]);

  const visible = q.trim() ? hits : [];

  function go(h: Hit) {
    onClose();
    setQ("");
    router.push(`/jobs/${h.id}`);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-lg border border-line bg-raised p-0 text-ink shadow-3 backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
      aria-label={t("nav.search")}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 text-ink-3">
          <path d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && visible[active]) {
              go(visible[active]);
            }
          }}
          placeholder={t("search.placeholder")}
          className="h-14 flex-1 bg-transparent text-body outline-none placeholder:text-ink-4"
          role="combobox"
          aria-expanded={visible.length > 0}
          aria-controls="search-results"
          aria-activedescendant={visible[active] ? `hit-${visible[active].id}` : undefined}
        />
      </div>
      <ul id="search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {!q.trim() ? <li className="px-3 py-6 text-small text-ink-3">{t("search.hint")}</li> : null}
        {state === "error" ? <li className="px-3 py-6 text-small text-signal">{err}</li> : null}
        {q.trim() && state === "idle" && visible.length === 0 ? <li className="px-3 py-6 text-small text-ink-3">{t("search.empty")}</li> : null}
        {visible.map((h, i) => (
          <li key={h.id} id={`hit-${h.id}`} role="option" aria-selected={i === active}>
            <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={clsx("flex w-full flex-col rounded-sm px-3 py-2.5 text-left", i === active && "bg-sunken")}>
              <span className="font-medium">{h.title ?? t("jobs.titleUnknown")}</span>
              <span className="text-small text-ink-3">{[h.company ?? t("jobs.companyUnknown"), h.location].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
