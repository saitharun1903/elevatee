"use client";

/**
 * Browser API client. Every request has a timeout and returns a typed error with the
 * server's user-facing message — never an endless pending state.
 */

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number; json?: unknown } = {}): Promise<T> {
  const { timeoutMs = 60_000, json, ...rest } = init;
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal,
      credentials: "same-origin",
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new ApiClientError("timeout", "The request took too long. Check your connection and try again.", 0);
    }
    throw new ApiClientError("network", "Couldn't reach Elevate. Check your connection and try again.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string } } | null)?.error;
    throw new ApiClientError(err?.code ?? "http_error", err?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return body as T;
}

export const errorMessage = (e: unknown) => (e instanceof ApiClientError ? e.message : "Something went wrong. Try again.");
