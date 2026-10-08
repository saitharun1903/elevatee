"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * Displays a real score returned by the backend. Animates from 0 to the actual value once,
 * when it first becomes visible. A null score renders an em dash — never a placeholder number.
 */
export function Score({ value, label, size = "lg", className }: { value: number | null; label: string; size?: "sm" | "lg"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(0);
  const shown = value === null ? null : reduce ? value : animated;

  useEffect(() => {
    if (value === null || reduce || !inView) return;
    const controls = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setAnimated(Math.round(v)) });
    return () => controls.stop();
  }, [value, inView, reduce]);

  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = shown === null ? 0 : shown / 100;
  const dim = size === "lg" ? "h-28 w-28" : "h-16 w-16";

  return (
    <div ref={ref} className={clsx("flex items-center gap-4", className)}>
      <div className={clsx("relative", dim)} role="img" aria-label={value === null ? `${label}: not available` : `${label}: ${value} out of 100`}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} className="fill-none stroke-line" strokeWidth="5" />
          {value !== null ? (
            <circle cx="50" cy="50" r={r} className="fill-none stroke-ink" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
          ) : null}
        </svg>
        <span className={clsx("absolute inset-0 flex items-center justify-center font-mono tnum", size === "lg" ? "text-[1.875rem]" : "text-body")}>{shown === null ? "—" : shown}</span>
      </div>
    </div>
  );
}

/** Horizontal factor bar for score components. null → "not evaluated". */
export function FactorBar({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)} aria-hidden>
      {value !== null ? <div className="h-full rounded-full bg-ink transition-[width] duration-700 ease-out" style={{ width: `${Math.round(value * 100)}%` }} /> : null}
    </div>
  );
}
