/**
 * Optional error reporting to Sentry (only when ELEVATE_SENTRY_DSN was set at build time).
 *
 * Minimal envelope POST — no SDK. Privacy: never sends page HTML, selections, tokens or job
 * content; URLs lose their query string and fragment; anything token-shaped is redacted.
 */

export interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
  dsn: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\/+|\/+$/g, "").split("/").pop();
    if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null;
    const prefix = u.pathname.replace(/\/?\d+\/?$/, "");
    const envelopeUrl = `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`;
    return { envelopeUrl, publicKey, dsn };
  } catch {
    return null;
  }
}

/** Remove query strings/fragments from URLs and redact bearer tokens, JWTs and long secrets. */
export function scrub(text: string): string {
  return text
    .replace(/\b((?:https?|chrome-extension):\/\/[^\s?#"'<>)]+)[?#][^\s"'<>)]*/gi, "$1")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[jwt]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .slice(0, 4000);
}

export interface Reporter {
  capture(error: unknown, context: string): void;
}

export function createReporter(opts: { dsn: string; release: string; environment: string; fetch?: typeof fetch }): Reporter {
  const parsed = parseDsn(opts.dsn);
  if (!parsed) return { capture() {} };
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let sent = 0;
  return {
    capture(error, context) {
      if (sent >= 20) return; // per-context cap, never flood
      sent++;
      const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-error thrown");
      const eventId = crypto.randomUUID().replace(/-/g, "");
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: "javascript",
        level: "error",
        release: `elevate-extension@${opts.release}`,
        environment: opts.environment,
        tags: { context },
        exception: {
          values: [{ type: scrub(err.name || "Error"), value: scrub(err.message || "") }],
        },
        extra: { stack: err.stack ? scrub(err.stack) : null },
      };
      const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: parsed.dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      f(parsed.envelopeUrl, { method: "POST", body, signal: ctrl.signal, credentials: "omit", keepalive: true })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    },
  };
}
