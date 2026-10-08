/**
 * Build-time configuration. Values are injected by esbuild `define` (see scripts/build.ts) and by
 * vitest `define` in tests. The extension holds no server secrets: only the public app URL, the
 * version and an optional (public) Sentry DSN.
 */
declare const __ELEVATE_APP_URL__: string;
declare const __ELEVATE_VERSION__: string;
declare const __ELEVATE_SENTRY_DSN__: string;

export const APP_URL: string = new URL(typeof __ELEVATE_APP_URL__ === "string" ? __ELEVATE_APP_URL__ : "http://localhost:3000").origin;
export const APP_ORIGIN: string = APP_URL;
export const VERSION: string = typeof __ELEVATE_VERSION__ === "string" ? __ELEVATE_VERSION__ : "0.0.0";
export const SENTRY_DSN: string = typeof __ELEVATE_SENTRY_DSN__ === "string" ? __ELEVATE_SENTRY_DSN__ : "";

export const appLinks = {
  connect: () => `${APP_URL}/extension/connect`,
  profile: () => `${APP_URL}/profile`,
  job: (jobId: string) => `${APP_URL}/jobs/${encodeURIComponent(jobId)}`,
};

/** Every network operation has a bound. */
export const TIMEOUTS = {
  analyzeMs: 45_000,
  defaultMs: 20_000,
  refreshMs: 15_000,
  pollRequestMs: 15_000,
  /** Time to receive response headers from the SSE endpoint. */
  sseConnectMs: 20_000,
  /** Abort and reconnect a stream that has been silent this long. */
  sseIdleMs: 90_000,
  pollIntervalMs: 4_000,
  /** Give up watching an analysis after this long. */
  watchTotalMs: 7 * 60_000,
  captureMs: 15_000,
} as const;
