import { clsx } from "clsx";

/** Empty state: one sentence of what's missing, one action. Never filler. */
export function EmptyState({
  title,
  body,
  action,
  className,
  compact,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={clsx("flex flex-col items-start gap-3", compact ? "py-6" : "py-14", className)}>
      <h3 className={clsx("font-display text-ink", compact ? "text-h3" : "text-h2")}>{title}</h3>
      {body ? <p className="max-w-prose text-ink-2">{body}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, message, onRetry, retryLabel = "Retry" }: { title?: string; message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 border-l-2 border-signal py-2 pl-4">
      {title ? <p className="font-medium text-ink">{title}</p> : null}
      <p className="text-small text-ink-2">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="text-small font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "caution" | "signal" | "accent"; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: "border-line-strong text-ink-2",
    caution: "border-caution text-ink-2",
    signal: "border-signal text-ink-2",
    accent: "border-accent text-ink-2",
  };
  return <div className={clsx("border-l-2 py-1 pl-3 text-small", tones[tone], className)}>{children}</div>;
}

/** Static skeleton lines — no shimmer, no endless motion. Used only while a real request is in flight. */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2.5", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3.5" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action, id }: { eyebrow?: string; title: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 pb-3">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 id={id} className="font-display text-h2">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
