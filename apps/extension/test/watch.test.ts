import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/lib/api";
import { watchAnalysis, WATCH_TIMEOUT_MESSAGE, type WatchApi, type WatchUpdate } from "../src/lib/watch";
import { streamResponse } from "./helpers";

const frame = (event: string, data: unknown, id?: number) => `${id !== undefined ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const noSleep = async () => {};

describe("watchAnalysis", () => {
  it("follows the stream to the end frame and reports server stages", async () => {
    const updates: WatchUpdate[] = [];
    const api: WatchApi = {
      openEvents: vi.fn(async () =>
        streamResponse([
          frame("ready", { analysisId: "a" }),
          frame("analysis_event", { id: 1, type: "analysis_started", stage: null, payload: {} }, 1),
          frame("status", { status: "EXTRACTING", stages: { extraction: { outcome: "running", reason: null } }, error: null }),
          frame("status", { status: "COMPLETED", stages: { extraction: { outcome: "completed", reason: null } }, error: null }),
          frame("end", { status: "COMPLETED" }),
        ]),
      ),
      getAnalysis: vi.fn(),
    };
    const r = await watchAnalysis({ api, analysisId: "a", jobId: "j", onUpdate: (u) => updates.push(u), sleep: noSleep });
    expect(r).toEqual({ status: "COMPLETED", error: null });
    expect(updates.map((u) => u.status)).toEqual(["EXTRACTING", "COMPLETED"]);
    expect(updates[0]!.stages).toEqual({ extraction: { outcome: "running", reason: null } });
    expect(api.getAnalysis).not.toHaveBeenCalled();
  });

  it("reconnects with ?after= when the server asks", async () => {
    const open = vi
      .fn<WatchApi["openEvents"]>()
      .mockResolvedValueOnce(streamResponse([frame("analysis_event", { id: 9 }, 9), frame("reconnect", { after: 9 })]))
      .mockResolvedValueOnce(streamResponse([frame("status", { status: "FAILED", stages: {}, error: { code: "x", message: "AI provider failed." } }), frame("end", { status: "FAILED" })]));
    const r = await watchAnalysis({ api: { openEvents: open, getAnalysis: vi.fn() }, analysisId: "a", jobId: "j", onUpdate: () => {}, sleep: noSleep });
    expect(open.mock.calls[0]![1]).toBeNull();
    expect(open.mock.calls[1]![1]).toBe("9");
    expect(r).toEqual({ status: "FAILED", error: { code: "x", message: "AI provider failed." } });
  });

  it("falls back to polling when the stream cannot be opened", async () => {
    const getAnalysis = vi
      .fn<WatchApi["getAnalysis"]>()
      .mockResolvedValueOnce({ analysis: { id: "a", status: "RESEARCHING", stages: { research: { outcome: "running", reason: null } }, error: null } })
      .mockResolvedValueOnce({ analysis: { id: "a", status: "PARTIAL", stages: { research: { outcome: "unavailable", reason: "No research provider" } }, error: null } });
    const sleep = vi.fn(noSleep);
    const updates: WatchUpdate[] = [];
    const r = await watchAnalysis({
      api: { openEvents: vi.fn(async () => Promise.reject(new ApiError("network", "down"))), getAnalysis },
      analysisId: "a",
      jobId: "j",
      onUpdate: (u) => updates.push(u),
      sleep,
    });
    expect(r.status).toBe("PARTIAL");
    expect(updates.every((u) => u.via === "poll")).toBe(true);
    expect(sleep).toHaveBeenCalledWith(4000, undefined);
  });

  it("falls back to polling on a server error frame", async () => {
    const getAnalysis = vi.fn<WatchApi["getAnalysis"]>(async () => ({ analysis: { id: "a", status: "COMPLETED", stages: {}, error: null } }));
    const r = await watchAnalysis({
      api: { openEvents: vi.fn(async () => streamResponse([frame("error", { message: "Live updates were interrupted." })])), getAnalysis },
      analysisId: "a",
      jobId: "j",
      onUpdate: () => {},
      sleep: noSleep,
    });
    expect(r.status).toBe("COMPLETED");
    expect(getAnalysis).toHaveBeenCalledTimes(1);
  });

  it("does not fall back on session expiry", async () => {
    const getAnalysis = vi.fn();
    await expect(
      watchAnalysis({
        api: { openEvents: vi.fn(async () => Promise.reject(new ApiError("session_expired", "Sign in", 401))), getAnalysis },
        analysisId: "a",
        jobId: "j",
        onUpdate: () => {},
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ code: "session_expired" });
    expect(getAnalysis).not.toHaveBeenCalled();
  });

  it("gives up after the total time limit with a clear message", async () => {
    let t = 0;
    const r = watchAnalysis({
      api: {
        openEvents: vi.fn(async () => Promise.reject(new ApiError("network", "down"))),
        getAnalysis: vi.fn(async () => ({ analysis: { id: "a", status: "RESEARCHING" as const, stages: {}, error: null } })),
      },
      analysisId: "a",
      jobId: "j",
      onUpdate: () => {},
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    await expect(r).rejects.toMatchObject({ code: "watch_timeout", message: WATCH_TIMEOUT_MESSAGE });
    expect(t).toBeLessThanOrEqual(7 * 60_000);
  });

  it("stops polling after repeated failures", async () => {
    const getAnalysis = vi.fn(async () => Promise.reject(new ApiError("server", "boom", 500)));
    await expect(
      watchAnalysis({ api: { openEvents: vi.fn(async () => Promise.reject(new ApiError("network", "down"))), getAnalysis }, analysisId: "a", jobId: "j", onUpdate: () => {}, sleep: noSleep }),
    ).rejects.toMatchObject({ code: "server" });
    expect(getAnalysis).toHaveBeenCalledTimes(5);
  });

  it("reconnects a silent stream after the idle timeout, then polls after repeated silence", async () => {
    const open = vi.fn<WatchApi["openEvents"]>(async (_a, _after, _t, signal) => streamResponse([frame("ready", {})], { keepOpen: true, signal }));
    const getAnalysis = vi.fn<WatchApi["getAnalysis"]>(async () => ({ analysis: { id: "a", status: "COMPLETED", stages: {}, error: null } }));
    const r = await watchAnalysis({
      api: { openEvents: open, getAnalysis },
      analysisId: "a",
      jobId: "j",
      onUpdate: () => {},
      sleep: noSleep,
      timeouts: { sseIdleMs: 15 },
      maxStreamRetries: 1,
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("COMPLETED");
  });
});
