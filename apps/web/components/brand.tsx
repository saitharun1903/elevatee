import Link from "next/link";
import { clsx } from "clsx";

/**
 * The Elevate mark: a baseline with one segment lifted — the job, and the step above it.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={clsx("shrink-0", className)}>
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <path d="M7 21.5h7.2l3.6-9h7.2" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-paper" />
      <circle cx="25" cy="12.5" r="2.2" className="fill-accent" />
    </svg>
  );
}

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={clsx("inline-flex items-center gap-2.5 rounded-sm", className)} aria-label="Elevate">
      <Mark className="h-7 w-7" />
      <span className="font-display text-[1.375rem] leading-none tracking-[-0.02em]">Elevate</span>
    </Link>
  );
}
