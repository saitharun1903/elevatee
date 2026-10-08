/** Errors that carry a machine code and a user-safe message. */
export type ElevateErrorCode =
  | "provider_unavailable"
  | "provider_error"
  | "timeout"
  | "invalid_input"
  | "blocked_url"
  | "fetch_failed"
  | "page_blocked"
  | "not_a_job"
  | "unsupported_file"
  | "parse_failed"
  | "ai_output_invalid"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "conflict"
  | "internal";

export class ElevateError extends Error {
  readonly code: ElevateErrorCode;
  /** Safe to show to the user. Never include secrets or untrusted page/resume content. */
  readonly userMessage: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ElevateErrorCode,
    userMessage: string,
    opts: { status?: number; cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(userMessage, { cause: opts.cause });
    this.name = "ElevateError";
    this.code = code;
    this.userMessage = userMessage;
    this.status = opts.status ?? defaultStatus(code);
    this.details = opts.details;
  }
}

function defaultStatus(code: ElevateErrorCode): number {
  switch (code) {
    case "invalid_input":
    case "blocked_url":
    case "unsupported_file":
    case "not_a_job":
      return 400;
    case "unauthorized":
      return 401;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "provider_unavailable":
      return 503;
    case "timeout":
      return 504;
    case "page_blocked":
    case "fetch_failed":
      return 502;
    default:
      return 500;
  }
}

export const isElevateError = (e: unknown): e is ElevateError => e instanceof ElevateError;
