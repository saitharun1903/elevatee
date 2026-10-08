"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";
import { SearchDialog } from "@/components/search-dialog";
import { browserSupabase } from "@/lib/client/supabase";
import { getT } from "@/lib/i18n";

const t = getT();

const PRIMARY = [
  { href: "/home", label: t("nav.home"), icon: "M3 10.5 10 4l7 6.5V17a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" },
  { href: "/jobs", label: t("nav.jobs"), icon: "M3 7h14v10H3zM7 7V4.5h6V7" },
  { href: "/preparation", label: t("nav.preparation"), icon: "M4 4h12v13H4zM7 8h6M7 11h6M7 14h3" },
  { href: "/interviews", label: t("nav.interviews"), icon: "M4 5h12v8H9l-4 3v-3H4z" },
];

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={clsx("h-5 w-5", className)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AccountMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
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

  async function signOut() {
    await browserSupabase()?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const initial = (email ?? "?").charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-raised font-mono text-small text-ink-2 hover:border-ink-3"
        aria-label={t("nav.profile")}
      >
        {initial}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-40 w-60 rounded-md border border-line bg-raised p-1.5 shadow-3">
          {email ? <p className="truncate px-3 pb-2 pt-1.5 text-meta text-ink-3">{email}</p> : null}
          {[
            { href: "/profile", label: t("nav.profile") },
            { href: "/settings", label: t("nav.settings") },
          ].map((i) => (
            <Link key={i.href} role="menuitem" href={i.href} onClick={() => setOpen(false)} className="block rounded-sm px-3 py-2 text-small hover:bg-sunken">
              {i.label}
            </Link>
          ))}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={signOut} className="block w-full rounded-sm px-3 py-2 text-left text-small hover:bg-sunken">
            {t("nav.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ email, children }: { email: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-3 px-4 sm:px-8">
          <Link href="/home" aria-label="Elevate — Home" className="rounded-sm">
            <Mark className="h-7 w-7" />
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
            {PRIMARY.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? "page" : undefined}
                className={clsx("relative rounded-sm px-3 py-1.5 text-[0.9375rem] transition-colors", isActive(n.href) ? "text-ink" : "text-ink-3 hover:text-ink")}
              >
                {n.label}
                {isActive(n.href) ? <span className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-ink" /> : null}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 items-center gap-2 rounded-sm border border-line px-2.5 text-small text-ink-3 hover:border-line-strong hover:text-ink sm:w-56"
              aria-label={t("nav.search")}
            >
              <Icon d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5 17 17" className="h-4 w-4" />
              <span className="hidden sm:inline">{t("nav.search")}</span>
              <kbd className="ml-auto hidden font-mono text-meta text-ink-4 sm:inline">⌘K</kbd>
            </button>
            <span className="hidden sm:block">
              <Link href="/analyze" className={buttonClass("primary", "sm")}>
                {t("nav.analyze")}
              </Link>
            </span>
            <AccountMenu email={email} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-28 pt-6 sm:px-8 md:pb-16 md:pt-10">
        {children}
      </main>

      {/* Mobile: thumb-reachable primary navigation */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {PRIMARY.slice(0, 2).map((n) => (
            <MobileItem key={n.href} {...n} active={isActive(n.href)} />
          ))}
          <li className="flex items-center justify-center">
            <Link href="/analyze" aria-label={t("nav.analyze")} className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-paper shadow-2">
              <Icon d="M10 4v12M4 10h12" />
            </Link>
          </li>
          {PRIMARY.slice(2).map((n) => (
            <MobileItem key={n.href} {...n} active={isActive(n.href)} />
          ))}
        </ul>
      </nav>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function MobileItem({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={clsx("flex flex-col items-center gap-0.5 py-2 text-[0.6875rem]", active ? "text-ink" : "text-ink-3")}>
        <Icon d={icon} />
        {label}
      </Link>
    </li>
  );
}
