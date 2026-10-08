import { describe, expect, it, vi } from "vitest";
import { handleExternalMessage, isTrustedSender, type ExternalSender } from "../src/lib/external";

const APP = "http://localhost:3000";
const deps = () => ({ appOrigin: APP, version: "1.2.3", saveSession: vi.fn(async () => {}), clearSession: vi.fn(async () => {}) });
const session = { type: "elevate:session", accessToken: "tok.en.x", refreshToken: "refresh-token-1", expiresAt: 1_900_000_000, email: "me@example.com" };

describe("isTrustedSender", () => {
  it("accepts exactly the app origin", () => {
    expect(isTrustedSender({ origin: APP, url: `${APP}/extension/connect` }, APP)).toBe(true);
    expect(isTrustedSender({ origin: APP }, `${APP}/`)).toBe(true);
  });

  const untrusted: ExternalSender[] = [
    { origin: "http://localhost:3001" },
    { origin: "https://localhost:3000" },
    { origin: "http://evil.localhost:3000" },
    { origin: "http://localhost:3000.evil.com" },
    { origin: "null" },
    {},
    { origin: APP, url: "https://evil.example/extension/connect" },
  ];
  it.each(untrusted.map((s) => [s]))("rejects %j", (sender) => {
    expect(isTrustedSender(sender, APP)).toBe(false);
  });

  it("rejects a missing sender", () => {
    expect(isTrustedSender(undefined, APP)).toBe(false);
  });
});

describe("handleExternalMessage", () => {
  it("stores a valid session from the app origin", async () => {
    const d = deps();
    await expect(handleExternalMessage(session, { origin: APP, url: `${APP}/extension/connect` }, d)).resolves.toEqual({ ok: true });
    expect(d.saveSession).toHaveBeenCalledWith({ accessToken: "tok.en.x", refreshToken: "refresh-token-1", expiresAt: 1_900_000_000, email: "me@example.com" });
  });

  it("rejects a session from any other origin without storing it", async () => {
    const d = deps();
    await expect(handleExternalMessage(session, { origin: "https://evil.example" }, d)).resolves.toEqual({ ok: false, error: "untrusted_origin" });
    expect(d.saveSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid session payload", async () => {
    const d = deps();
    await expect(handleExternalMessage({ ...session, expiresAt: "soon" }, { origin: APP }, d)).resolves.toEqual({ ok: false, error: "invalid_session" });
    expect(d.saveSession).not.toHaveBeenCalled();
  });

  it("answers ping with the version", async () => {
    await expect(handleExternalMessage({ type: "elevate:ping" }, { origin: APP }, deps())).resolves.toEqual({ ok: true, version: "1.2.3" });
  });

  it("does not answer ping for other origins", async () => {
    await expect(handleExternalMessage({ type: "elevate:ping" }, { origin: "https://other.example" }, deps())).resolves.toMatchObject({ ok: false });
  });

  it("signs out only for the app origin", async () => {
    const d = deps();
    await expect(handleExternalMessage({ type: "elevate:signout" }, { origin: "https://other.example" }, d)).resolves.toMatchObject({ ok: false });
    expect(d.clearSession).not.toHaveBeenCalled();
    await expect(handleExternalMessage({ type: "elevate:signout" }, { origin: APP }, d)).resolves.toEqual({ ok: true });
    expect(d.clearSession).toHaveBeenCalled();
  });

  it("rejects unknown and malformed messages", async () => {
    await expect(handleExternalMessage({ type: "elevate:unknown" }, { origin: APP }, deps())).resolves.toEqual({ ok: false, error: "unknown_type" });
    await expect(handleExternalMessage("hello", { origin: APP }, deps())).resolves.toEqual({ ok: false, error: "invalid_message" });
  });
});
