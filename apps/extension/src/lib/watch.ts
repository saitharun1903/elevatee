/**
 * Follow an analysis to a terminal state.
 *
 * Primary: the authenticated SSE stream (fetch + ReadableStream). It honours server `reconnect`
 * frames (`?after=`), reconnects on silent/closed streams a couple of times, and otherwise falls
 * back to polling `GET /jobs/:jobId/analysis` every 4 s. The whole watch gives up after 7 minutes
 * with a clear error — there is never an unbounded wait.
 */
import { ApiError } from "./api";
import { readSseStream, type SseEvent } from "./sse";
import { isTerminalStatus, type AnalysisSnapshot, type AnalysisStatus, type Stages } from "../shared/types";

export interface WatchUpdate {
  status: AnalysisStatus;
  stages: Stages | null;
  error: { code: string; message: string } | null;
  via: "stream" | "poll";
}

export interface WatchResult {
  status: AnalysisStatus;
  error: { code: string; message: string } | null;
}

export interface WatchApi {
  openEvents(analysisId: string, after: string | null, timeoutMs: number, signal?: AbortSignal): Promise<Response>;
  getAnalysis(jobId: string, timeoutMs: number, signal?: AbortSignal): Promise<{ analysis: AnalysisSnapshot | null }>;
}

export interface WatchOptions {
  api: WatchApi;
  analysisId: string;
  jobId: string;
  onUpdate(u: WatchUpdate): void;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  timeouts?: Partial<{ sseConnectMs: number; sseIdleMs: number; pollIntervalMs: number; pollRequestMs: number; totalMs: number }>;
  /** Unexpected stream closes tolerated before switching to polling. */
  maxStreamRetries?: number;
}

export const WATCH_TIMEOUT_MESSAGE =
  "This analysis is taking longer than expected (over 7 minutes). It may still finish — open the full analysis in Elevate to check on it.";

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError("aborted", "Cancelled."));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ApiError("aborted", "Cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const STATUSES = new Set<string>([
  "CREATED", "CAPTURED", "EXTRACTING", "CLASSIFYING", "RESEARCHING", "CANDIDATE_ANALYSIS", "ATS", "FIT", "FINALIZING",
  "COMPLETED", "PARTIAL", "FAILED", "TIMEOUT",
]);

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function asStatus(v: unknown): AnalysisStatus | null {
  return typeof v === "string" && STATUSES.has(v) ? (v as AnalysisStatus) : null;
}

function asError(v: unknown): { code: string; message: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return typeof o.message === "string" ? { code: typeof o.code === "string" ? o.code : "error", message: o.message } : null;
}

function asStages(v: unknown): Stages | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Stages) : null;
}

/** Errors that must not trigger a fallback: the user has to act (sign in) or it was cancelled. */
function isFatal(e: unknown): boolean {
  return e instanceof ApiError && (e.code === "session_expired" || e.code === "aborted" || e.code === "not_found" || e.status === 403);
}

export async function watchAnalysis(opts: WatchOptions): Promise<WatchResult> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? abortableSleep;
  const t = {
    sseConnectMs: 20_000,
    sseIdleMs: 90_000,
    pollIntervalMs: 4_000,
    pollRequestMs: 15_000,
    totalMs: 7 * 60_000,
    ...opts.timeouts,
  };
  const deadline = now() + t.totalMs;
  const maxRetries = opts.maxStreamRetries ?? 2;
  let last: WatchUpdate | null = null;

  const emit = (u: WatchUpdate) => {
    last = u;
    opts.onUpdate(u);
  };

  // ---- Streaming phase ------------------------------------------------------------------------
  let after: string | null = null;
  let retries = 0;
  stream: while (now() < deadline) {
    if (opts.signal?.aborted) throw new ApiError("aborted", "Cancelled.");
    const ctrl = new AbortController();
    const onOuter = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onOuter, { once: true });
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let idled = false;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      const remaining = deadline - now();
      idleTimer = setTimeout(() => {
        idled = true;
        ctrl.abort();
      }, Math.max(1, Math.min(t.sseIdleMs, remaining)));
    };

    let ended: AnalysisStatus | null = null;
    let reconnectAfter: string | null = null;
    let serverError = false;
    try {
      const res = await opts.api.openEvents(opts.analysisId, after, t.sseConnectMs, ctrl.signal);
      if (!res.body) throw new ApiError("bad_response", "No stream body.");
      armIdle();
      const onEvent = (e: SseEvent) => {
        if (e.id) after = e.id;
        const data = parseJson(e.data) as Record<string, unknown> | null;
        switch (e.event) {
          case "status": {
            const status = asStatus(data?.status);
            if (status) emit({ status, stages: asStages(data?.stages), error: asError(data?.error), via: "stream" });
            break;
          }
          case "end":
            ended = asStatus(data?.status) ?? last?.status ?? "FAILED";
            break;
          case "reconnect": {
            const a = data?.after;
            reconnectAfter = typeof a === "number" || typeof a === "string" ? String(a) : after ?? "0";
            break;
          }
          case "error":
            serverError = true;
            break;
          default:
            break; // ready, analysis_event: informational
        }
      };
      const { lastEventId } = await readSseStream(res.body, onEvent, armIdle);
      if (lastEventId) after = lastEventId;
    } catch (e) {
      if (opts.signal?.aborted) throw new ApiError("aborted", "Cancelled.");
      if (isFatal(e)) throw e;
      if (!idled) {
        // Could not open or read the stream at all: switch to polling.
        break stream;
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      opts.signal?.removeEventListener("abort", onOuter);
    }

    if (ended) {
      const lastU = last as WatchUpdate | null;
      return { status: ended, error: lastU?.error ?? null };
    }
    if (serverError) break stream;
    if (reconnectAfter !== null) {
      after = reconnectAfter;
      retries = 0;
      continue;
    }
    // Closed or idle without an end frame.
    if (++retries > maxRetries) break stream;
  }

  // ---- Polling fallback -----------------------------------------------------------------------
  let failures = 0;
  while (now() < deadline) {
    if (opts.signal?.aborted) throw new ApiError("aborted", "Cancelled.");
    try {
      const { analysis } = await opts.api.getAnalysis(opts.jobId, t.pollRequestMs, opts.signal);
      failures = 0;
      if (analysis) {
        const status = asStatus(analysis.status);
        if (status) {
          const u: WatchUpdate = { status, stages: asStages(analysis.stages), error: asError(analysis.error), via: "poll" };
          emit(u);
          if (isTerminalStatus(status)) return { status, error: u.error };
        }
      }
    } catch (e) {
      if (isFatal(e)) throw e;
      if (++failures >= 5) throw e;
    }
    const wait = Math.min(t.pollIntervalMs, deadline - now());
    if (wait <= 0) break;
    await sleep(wait, opts.signal);
  }
  throw new ApiError("watch_timeout", WATCH_TIMEOUT_MESSAGE);
}
