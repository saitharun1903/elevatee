import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, errorFromResponse, type TokenSource } from "../src/lib/api";
import { SessionExpiredError } from "../src/lib/session";
import { jsonResponse } from "./helpers";

const APP = "http://localhost:3000";

function tokens(overrides: Partial<TokenSource> = {}): TokenSource & { refresh: ReturnType<typeof vi.fn> } {
  const t = {
    getAccessToken: vi.fn(async () => "tok-1"),
    refresh: vi.fn(async () => ({ accessToken: "tok-2" })),
    ...overrides,
  };
  return t as TokenSource & { refresh: ReturnType<typeof vi.fn> };
}

const hanging: typeof fetch = (_u, init) =>
  new Promise<Response>((_r, reject) => {
    if (init!.signal!.aborted) return reject(new DOMException("aborted", "AbortError"));
    init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

const page = { url: "https://jobs.example.com/1", html: "<p>job</p>", capturedAt: "2026-10-07T10:00:00.000Z" };

describe("errorFromResponse", () => {
  it("uses the server's error envelope", async () => {
    const e = await errorFromResponse(jsonResponse({ error: { code: "not_a_job", message: "We couldn't find a job on this page.", requestId: "req_1" } }, 400));
    expect(e).toMatchObject({ code: "not_a_job", message: "We couldn't find a job on this page.", status: 400, requestId: "req_1" });
  });

  it("falls back to a status-based message for non-JSON bodies", async () => {
    const e = await errorFromResponse(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(e.code).toBe("server");
    expect(e.message).toMatch(/something went wrong/i);
    const r = await errorFromResponse(new Response("", { status: 429 }));
    expect(r.code).toBe("rate_limited");
  });
});

describe("ApiClient", () => {
  it("sends the bearer token and the capture body to /jobs/analyze", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ jobId: "j", analysisId: "a", deduplicated: false, reusedAnalysis: false, extraction: { warnings: [], completeness: 1 } }, 201));
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: f });
    await expect(api.analyze(page)).resolves.toMatchObject({ jobId: "j", analysisId: "a" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${APP}/api/v1/jobs/analyze`);
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer tok-1");
    expect(init!.credentials).toBe("omit");
    expect(JSON.parse(String(init!.body))).toEqual({ source: "capture", page });
  });

  it("maps 400 not_a_job to an ApiError with the server message", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: "not_a_job", message: "No job posting found.", requestId: "r" } }, 400));
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: f });
    await expect(api.analyze(page)).rejects.toMatchObject({ code: "not_a_job", message: "No job posting found.", status: 400 });
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { code: "unauthorized", message: "expired", requestId: "r" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: "job-1" }));
    let token = "tok-1";
    const t = tokens({ getAccessToken: async () => token });
    t.refresh.mockImplementation(async () => {
      token = "tok-2";
      return { accessToken: "tok-2" };
    });
    const api = new ApiClient({ appUrl: APP, tokens: t, fetch: f });
    await expect(api.getWorkspace("job-1")).resolves.toEqual({ id: "job-1" });
    expect(t.refresh).toHaveBeenCalledWith("tok-1");
    expect((f.mock.calls[1]![1]!.headers as Record<string, string>).authorization).toBe("Bearer tok-2");
  });

  it("gives up after a second 401 with session_expired", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: "unauthorized", message: "Sign in again.", requestId: "r" } }, 401));
    const t = tokens();
    const api = new ApiClient({ appUrl: APP, tokens: t, fetch: f });
    await expect(api.getWorkspace("x")).rejects.toMatchObject({ code: "session_expired" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(t.refresh).toHaveBeenCalledTimes(1);
  });

  it("maps a failed refresh to session_expired", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));
    const t = tokens();
    t.refresh.mockRejectedValue(new SessionExpiredError());
    const api = new ApiClient({ appUrl: APP, tokens: t, fetch: f });
    await expect(api.getWorkspace("x")).rejects.toMatchObject({ code: "session_expired" });
  });

  it("maps a missing session to session_expired without calling the network", async () => {
    const f = vi.fn<typeof fetch>();
    const api = new ApiClient({ appUrl: APP, tokens: tokens({ getAccessToken: async () => Promise.reject(new SessionExpiredError()) }), fetch: f });
    await expect(api.getWorkspace("x")).rejects.toMatchObject({ code: "session_expired" });
    expect(f).not.toHaveBeenCalled();
  });

  it("times out instead of hanging", async () => {
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: hanging });
    const err = await api.analyze(page, 25).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "timeout" });
  });

  it("maps network errors", async () => {
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: async () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(api.getWorkspace("x")).rejects.toMatchObject({ code: "network" });
  });

  it("maps caller aborts", async () => {
    const ctrl = new AbortController();
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: hanging, defaultTimeoutMs: 10_000 });
    const p = api.getWorkspace("x", ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
  });

  it("rejects invalid JSON bodies as bad_response", async () => {
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: async () => new Response("not json", { status: 200 }) });
    await expect(api.getWorkspace("x")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("builds the events URL with ?after= and returns the raw response", async () => {
    const f = vi.fn<typeof fetch>(async () => new Response("", { status: 200, headers: { "content-type": "text/event-stream" } }));
    const api = new ApiClient({ appUrl: APP, tokens: tokens(), fetch: f });
    const res = await api.openEvents("an-1", "42", 1000);
    expect(res).toBeInstanceOf(Response);
    expect(f.mock.calls[0]![0]).toBe(`${APP}/api/v1/analyses/an-1/events?after=42`);
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>).accept).toBe("text/event-stream");
  });
});
