import { ElevateError } from "./errors";

/** Default budgets for external calls, in milliseconds. */
export const TIMEOUTS = {
  ai: 45_000,
  aiLong: 90_000,
  research: 15_000,
  urlFetch: 12_000,
  storage: 15_000,
  analysisTotal: 240_000,
} as const;

/** Run `fn` with an AbortSignal that fires after `ms`. Converts aborts into ElevateError("timeout"). */
export async function withTimeout<T>(
  label: string,
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out`)), ms);
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ElevateError("timeout", `${label} did not respond within ${Math.round(ms / 1000)} seconds.`, {
        cause: err,
        details: { label, ms },
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}
