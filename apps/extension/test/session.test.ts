import { describe, expect, it, vi } from "vitest";
import { SESSION_KEY, SessionExpiredError, SessionStore, parseSession, type Session } from "../src/lib/session";
import { FakeStorage, jsonResponse } from "./helpers";

const NOW = 1_800_000_000_000; // ms
const nowS = NOW / 1000;
const APP = "http://localhost:3000";

function setup(session: Session | null, fetchImpl: typeof fetch, refreshTimeoutMs?: number) {
  const storage = new FakeStorage();
  if (session) storage.data.set(SESSION_KEY, session);
  const store = new SessionStore({ storage, appUrl: APP, fetch: fetchImpl, now: () => NOW, lock: (_n, fn) => fn(), refreshTimeoutMs });
  return { storage, store };
}

const fresh: Session = { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: nowS + 3600, email: "a@example.com" };
const expiring: Session = { ...fresh, expiresAt: nowS + 30 };

describe("parseSession", () => {
  it("accepts a valid payload and drops extra fields", () => {
    expect(parseSession({ type: "elevate:session", accessToken: "a.b.c", refreshToken: "r".repeat(20), expiresAt: nowS, email: "x@y.z" })).toEqual({
      accessToken: "a.b.c",
      refreshToken: "r".repeat(20),
      expiresAt: nowS,
      email: "x@y.z",
    });
  });

  const bad: unknown[] = [
    null,
    {},
    { accessToken: "", refreshToken: "r", expiresAt: 1 },
    { accessToken: "a", refreshToken: "r", expiresAt: "1" },
    { accessToken: "a", refreshToken: "r", expiresAt: -5 },
    { accessToken: "a b", refreshToken: "r", expiresAt: 5 },
    { accessToken: "a", refreshToken: "r", expiresAt: NOW * 1000 },
    { accessToken: "a", refreshToken: "r", expiresAt: 5, email: 42 },
  ];
  it.each(bad.map((b) => [b]))("rejects %j", (input) => {
    expect(parseSession(input)).toBeNull();
  });
});

describe("SessionStore", () => {
  it("returns the stored token without refreshing when it is not near expiry", async () => {
    const f = vi.fn<typeof fetch>();
    const { store } = setup(fresh, f);
    await expect(store.getAccessToken()).resolves.toBe("access-1");
    expect(f).not.toHaveBeenCalled();
  });

  it("refreshes proactively when < 60s remain and stores the rotated session", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ accessToken: "access-2", refreshToken: "refresh-2", expiresAt: nowS + 3600, email: "a@example.com" }));
    const { store, storage } = setup(expiring, f);
    await expect(store.getAccessToken()).resolves.toBe("access-2");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${APP}/api/v1/auth/refresh`);
    expect(init!.method).toBe("POST");
    expect(JSON.parse(String(init!.body))).toEqual({ refreshToken: "refresh-1" });
    expect((storage.data.get(SESSION_KEY) as Session).refreshToken).toBe("refresh-2");
  });

  it("shares one in-flight refresh between concurrent callers", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ accessToken: "access-2", refreshToken: "refresh-2", expiresAt: nowS + 3600, email: null }));
    const { store } = setup(expiring, f);
    const [a, b, c] = await Promise.all([store.getAccessToken(), store.getAccessToken(), store.refresh()]);
    expect([a, b, c.accessToken]).toEqual(["access-2", "access-2", "access-2"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("skips the network when another context already rotated the stale token", async () => {
    const f = vi.fn<typeof fetch>();
    const { store } = setup({ ...fresh, accessToken: "newer" }, f);
    await expect(store.refresh("access-1")).resolves.toMatchObject({ accessToken: "newer" });
    expect(f).not.toHaveBeenCalled();
  });

  it("clears the session when the server rejects the refresh token", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ error: { code: "unauthorized", message: "expired", requestId: "r" } }, 401));
    const { store, storage } = setup(expiring, f);
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it("clears the session when the refresh response is malformed", async () => {
    const f = vi.fn<typeof fetch>(async () => jsonResponse({ accessToken: 5 }));
    const { store, storage } = setup(expiring, f);
    await expect(store.refresh()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it("keeps the session on a network failure (the call fails; the user is not signed out)", async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { store, storage } = setup(expiring, f);
    await expect(store.refresh()).rejects.toThrow(/couldn't reach elevate/i);
    expect(storage.data.has(SESSION_KEY)).toBe(true);
  });

  it("times out a hanging refresh", async () => {
    const f = vi.fn<typeof fetch>(
      (_u, init) =>
        new Promise<Response>((_r, reject) => {
          init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const { store } = setup(expiring, f, 20);
    await expect(store.refresh()).rejects.toThrow(/timed out/i);
  });

  it("throws SessionExpiredError when signed out", async () => {
    const { store } = setup(null, vi.fn<typeof fetch>());
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("clear() removes the stored session", async () => {
    const { store, storage } = setup(fresh, vi.fn<typeof fetch>());
    await store.clear();
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });
});
