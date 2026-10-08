import "server-only";
import * as Sentry from "@sentry/nextjs";

/** Sentry is active only when SENTRY_DSN is configured. Context never includes user content. */
export const sentryEnabled = () => !!process.env.SENTRY_DSN;

export function captureException(err: unknown, context: Record<string, string | number | null | undefined> = {}) {
  if (!sentryEnabled()) return;
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) if (v !== undefined) scope.setTag(k, String(v));
    Sentry.captureException(err);
  });
}
