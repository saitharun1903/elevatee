import Link from "next/link";
import { clsx } from "clsx";
import { getT } from "@/lib/i18n";

const t = getT();

/** One job as a line of text: role, then company and place. Used in lists instead of cards. */
export function JobLine({
  id,
  title,
  company,
  location,
  meta,
  aside,
  className,
}: {
  id: string;
  title: string | null;
  company: string | null;
  location?: string | null;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={`/jobs/${id}`} className={clsx("group flex items-baseline justify-between gap-4 py-3.5", className)}>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">{title ?? t("jobs.titleUnknown")}</span>
        <span className="block truncate text-small text-ink-3">
          {[company ?? t("jobs.companyUnknown"), location].filter(Boolean).join(" · ")}
          {meta ? <> · {meta}</> : null}
        </span>
      </span>
      {aside ? <span className="shrink-0 text-small text-ink-3">{aside}</span> : null}
    </Link>
  );
}
