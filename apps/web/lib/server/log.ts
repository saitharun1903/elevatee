import "server-only";

/**
 * Structured JSON logs. Only identifiers, stages, durations and statuses are logged —
 * never resume text, job page content, tokens, passwords or API keys.
 */

const REDACT_KEYS = /(token|secret|password|authorization|cookie|key|resume|text|html|content|snippet|answer|email)/i;

type Fields = Record<string, unknown>;

function scrub(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT_KEYS.test(k) && !/^(requestId|jobId|analysisId|userId|provider|stage|status|durationMs|code)$/.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 300) {
      out[k] = `${v.slice(0, 300)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...scrub(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => emit("info", event, fields),
  warn: (event: string, fields: Fields = {}) => emit("warn", event, fields),
  error: (event: string, fields: Fields = {}) => emit("error", event, fields),
};

export function newRequestId(): string {
  return crypto.randomUUID();
}
