"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { relativeTime } from "@/lib/format";
import { getT } from "@/lib/i18n";

const t = getT();

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Bell with the user's real notifications (analysis finished, interview scheduled). */
export function Notifications() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const load = useCallback(() => {
    api<{ notifications: Notification[] }>("/api/v1/notifications", { timeoutMs: 15_000 }).then(
      (res) => {
        setItems(res.notifications);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  // Refresh on navigation and when the tab regains focus; no background polling.
  useEffect(load, [load, pathname]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const now = new Date().toISOString();
      setItems((xs) => xs?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? xs);
      api("/api/v1/notifications", { method: "PATCH", json: { all: true } }).catch(() => {});
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? t("notifications.labelUnread", { n: unread }) : t("notifications.label")}
        className="relative flex h-9 w-9 items-center justify-center rounded-sm border border-line text-ink-3 hover:border-line-strong hover:text-ink"
      >
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
          <path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12 5 8zM8.5 16.5a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {unread ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 font-mono text-[0.625rem] text-paper">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div role="dialog" aria-label={t("notifications.label")} className="fixed inset-x-4 top-16 z-40 rounded-md border border-line bg-raised p-1.5 shadow-3 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80">
          <p className="px-3 pb-1 pt-2 eyebrow">{t("notifications.label")}</p>
          {failed && !items ? <p className="px-3 py-4 text-small text-signal">{t("common.errorGeneric")}</p> : null}
          {items && items.length === 0 ? <p className="px-3 py-4 text-small text-ink-3">{t("notifications.empty")}</p> : null}
          <ul className="max-h-[60vh] overflow-y-auto">
            {(items ?? []).map((n) => {
              const inner = (
                <>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={clsx("text-small", n.kind.endsWith("failed") ? "text-signal" : "text-ink")}>{n.title}</span>
                    <span className="shrink-0 text-meta text-ink-4">{relativeTime(n.created_at)}</span>
                  </span>
                  {n.body ? <span className="block truncate text-meta text-ink-3">{n.body}</span> : null}
                </>
              );
              return (
                <li key={n.id}>
                  {n.link?.startsWith("/") ? (
                    <Link href={n.link} onClick={() => setOpen(false)} className="block rounded-sm px-3 py-2.5 hover:bg-sunken">
                      {inner}
                    </Link>
                  ) : (
                    <div className="px-3 py-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
