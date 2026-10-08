/**
 * Elevate API client for the extension.
 *
 * - Every request has a timeout and ends in a typed ApiError (never hangs).
 * - Sends the user's own access token as a Bearer header; refreshes once on 401.
 * - Server errors are JSON `{ error: { code, message, requestId } }`; `message` is user-facing.
 */
import { SessionExpiredError } from "./session";
import type { AnalysisSnapshot, AnalyzeResponse, CapturedPagePayload, JobWorkspace } from "../shared/types";

export type ApiErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "unauthorized"
  | "session_expired"
  | "not_a_job"
  | "not_found"
  | "rate_limited"
  | "server"
  | "bad_response"
  | (string & {});

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number | null = null,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TokenSource {
  getAccessToken(): Promise<string>;
  /** Force a refresh after a 401; resolves to the new session's access token. */
  refresh(staleAccessToken?: string): Promise<{ accessToken: string }>;
}

export interface ApiClientDeps {
  appUrl: string;
  tokens: TokenSource;
  fetch?: typeof fetch;
  defaultTimeoutMs?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** For streaming: resolve once headers arrive and hand back the raw Response. */
  raw?: boolean;
  headers?: Record<string, string>;
}

const FALLBACK_MESSAGES: Record<string, string> = {
  network: "Couldn't reach Elevate. Check your connection and try again.",
  timeout: "Elevate took too long to respond. Try again.",
  server: "Something went wrong on Elevate's side. Try again.",
  bad_response: "Elevate sent an unexpected response. Try again.",
  rate_limited: "You're doing that too often. Wait a moment and try again.",
  not_found: "That item no longer exists in Elevate.",
};

/** Map a non-2xx response to an ApiError using the server's JSON error envelope when present. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  let code: string | null = null;
  let message: string | null = null;
  let requestId: string | null = res.headers.get("x-request-id");
  try {
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown; requestId?: unknown } };
    if (body && typeof body === "object" && body.error && typeof body.error === "object") {
      if (typeof body.error.code === "string") code = body.error.code;
      if (typeof body.error.message === "string" && body.error.message.trim()) message = body.error.message.slice(0, 500);
      if (typeof body.error.requestId === "string") requestId = body.error.requestId;
    }
  } catch {
    /* not JSON */
  }
  const fallbackCode = res.status === 401 ? "unauthorized" : res.status === 404 ? "not_found" : res.status === 429 ? "rate_limited" : res.status >= 500 ? "server" : "bad_request";
  const finalCode = code ?? fallbackCode;
  const finalMessage = message ?? FALLBACK_MESSAGES[finalCode] ?? FALLBACK_MESSAGES[fallbackCode] ?? `Elevate returned an error (${res.status}).`;
  return new ApiError(finalCode, finalMessage, res.status, requestId);
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: ApiClientDeps) {
    this.fetchImpl = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(path, opts, false);
    if (opts.raw) return res as unknown as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError("bad_response", FALLBACK_MESSAGES.bad_response!, res.status);
    }
  }

  private async token(): Promise<string> {
    try {
      return await this.deps.tokens.getAccessToken();
    } catch (e) {
      if (e instanceof SessionExpiredError) throw new ApiError("session_expired", e.message, 401);
      throw new ApiError("network", e instanceof Error ? e.message : FALLBACK_MESSAGES.network!);
    }
  }

  private async send(path: string, opts: RequestOptions, isRetry: boolean): Promise<Response> {
    const token = await this.token();
    if (opts.signal?.aborted) throw new ApiError("aborted", "Cancelled.");
    const timeoutMs = opts.timeoutMs ?? this.deps.defaultTimeoutMs ?? 20_000;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const onOuterAbort = () => ctrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    let res: Response;
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: opts.raw ? "text/event-stream" : "application/json", ...opts.headers };
      if (opts.body !== undefined) headers["content-type"] = "application/json";
      res = await this.fetchImpl(`${this.deps.appUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
      if (timedOut) throw new ApiError("timeout", FALLBACK_MESSAGES.timeout!);
      if (opts.signal?.aborted) throw new ApiError("aborted", "Cancelled.");
      throw new ApiError("network", FALLBACK_MESSAGES.network!);
    }
    // Headers arrived. For streams the caller owns the body from here on (and its own idle timeout); the outer signal stays linked so aborting it also cancels the body read.
    clearTimeout(timer);
    if (!opts.raw || !res.ok) opts.signal?.removeEventListener("abort", onOuterAbort);

    if (res.status === 401 && !isRetry) {
      try {
        await this.deps.tokens.refresh(token);
      } catch (e) {
        if (e instanceof SessionExpiredError) throw new ApiError("session_expired", e.message, 401);
        throw new ApiError("network", e instanceof Error ? e.message : FALLBACK_MESSAGES.network!);
      }
      return this.send(path, opts, true);
    }
    if (res.status === 401) {
      const err = await errorFromResponse(res);
      throw new ApiError("session_expired", err.message, 401, err.requestId);
    }
    if (!res.ok) throw await errorFromResponse(res);
    return res;
  }

  analyze(page: CapturedPagePayload, timeoutMs = 45_000): Promise<AnalyzeResponse> {
    return this.request<AnalyzeResponse>("/api/v1/jobs/analyze", { method: "POST", body: { source: "capture", page }, timeoutMs });
  }

  getWorkspace(jobId: string, signal?: AbortSignal): Promise<JobWorkspace> {
    return this.request<JobWorkspace>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { signal });
  }

  getAnalysis(jobId: string, timeoutMs: number, signal?: AbortSignal): Promise<{ analysis: AnalysisSnapshot | null }> {
    return this.request(`/api/v1/jobs/${encodeURIComponent(jobId)}/analysis`, { timeoutMs, signal });
  }

  openEvents(analysisId: string, after: string | null, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const q = after ? `?after=${encodeURIComponent(after)}` : "";
    return this.request<Response>(`/api/v1/analyses/${encodeURIComponent(analysisId)}/events${q}`, { raw: true, timeoutMs, signal });
  }
}
