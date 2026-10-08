import { clsx } from "clsx";
import type { EvidenceType } from "@elevate/core";
import { getT } from "@/lib/i18n";

const t = getT();

const styles: Record<EvidenceType, string> = {
  verified: "text-accent",
  source_backed: "text-info",
  candidate_reported: "text-caution",
  inferred: "text-ink-3",
  predicted: "text-ink-3",
};

const glyph: Record<EvidenceType, React.ReactNode> = {
  // filled square: directly read; ring: external source; half: reported; dot: inferred; dashed ring: predicted
  verified: <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" className="fill-current" />,
  source_backed: <circle cx="5" cy="5" r="3.4" className="fill-none stroke-current" strokeWidth="1.6" />,
  candidate_reported: (
    <>
      <circle cx="5" cy="5" r="3.4" className="fill-none stroke-current" strokeWidth="1.6" />
      <path d="M5 1.6a3.4 3.4 0 0 1 0 6.8z" className="fill-current" />
    </>
  ),
  inferred: <circle cx="5" cy="5" r="2" className="fill-current" />,
  predicted: <circle cx="5" cy="5" r="3.4" className="fill-none stroke-current" strokeWidth="1.4" strokeDasharray="2 1.6" />,
};

/** A small, consistent marker of how trustworthy a piece of information is. Shape + label, not colour alone. */
export function EvidenceTag({ type, origin, className }: { type: EvidenceType; origin?: "job_posting" | "resume" | "research" | "elevate"; className?: string }) {
  const label = type === "verified" && origin === "resume" ? t("evidence.verifiedResume") : t(`evidence.${type}`);
  return (
    <span className={clsx("inline-flex items-center gap-1.5 font-mono text-meta whitespace-nowrap", styles[type], className)} title={t(`evidence.legend_${type}`)}>
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
        {glyph[type]}
      </svg>
      {label}
    </span>
  );
}

export function EvidenceLegend() {
  const types: EvidenceType[] = ["verified", "source_backed", "candidate_reported", "inferred", "predicted"];
  return (
    <details className="group relative text-small">
      <summary className="cursor-pointer list-none text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="underline decoration-line-strong underline-offset-4">{t("evidence.legendTitle")}</span>
      </summary>
      <dl className="absolute right-0 z-20 mt-3 grid w-[min(26rem,calc(100vw-2rem))] gap-2 rounded-md border border-line bg-raised p-4 shadow-3 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {types.map((ty) => (
          <div key={ty} className="contents">
            <dt>
              <EvidenceTag type={ty} />
            </dt>
            <dd className="text-ink-2">{t(`evidence.legend_${ty}`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Quoted evidence line, e.g. the posting or resume text that supports a claim. */
export function Quote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <q className={clsx("block border-l border-line-strong pl-3 text-small italic text-ink-3 [quotes:none]", className)}>{children}</q>;
}
