/**
 * Messages from the Elevate web app (chrome.runtime.onMessageExternal).
 *
 * Only the configured APP_URL origin is accepted (manifest `externally_connectable` restricts
 * this too; we check again because the manifest is not the only line of defense).
 */
import { parseSession, type Session } from "./session";

export type ExternalReply = { ok: true; version?: string } | { ok: false; error: string };

export interface ExternalDeps {
  appOrigin: string;
  version: string;
  saveSession(s: Session): Promise<void>;
  clearSession(): Promise<void>;
}

export interface ExternalSender {
  origin?: string;
  url?: string;
  id?: string;
}

/** True only when the sender is exactly the app origin (scheme + host + port). */
export function isTrustedSender(sender: ExternalSender | undefined, appOrigin: string): boolean {
  if (!sender || typeof sender.origin !== "string") return false;
  let expected: string;
  try {
    expected = new URL(appOrigin).origin;
  } catch {
    return false;
  }
  if (sender.origin !== expected) return false;
  // If a URL is present it must agree with the origin.
  if (typeof sender.url === "string") {
    try {
      if (new URL(sender.url).origin !== expected) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function handleExternalMessage(message: unknown, sender: ExternalSender | undefined, deps: ExternalDeps): Promise<ExternalReply> {
  if (!isTrustedSender(sender, deps.appOrigin)) return { ok: false, error: "untrusted_origin" };
  if (!message || typeof message !== "object") return { ok: false, error: "invalid_message" };
  const m = message as Record<string, unknown>;
  switch (m.type) {
    case "elevate:ping":
      return { ok: true, version: deps.version };
    case "elevate:session": {
      const session = parseSession(m);
      if (!session) return { ok: false, error: "invalid_session" };
      await deps.saveSession(session);
      return { ok: true };
    }
    case "elevate:signout":
      await deps.clearSession();
      return { ok: true };
    default:
      return { ok: false, error: "unknown_type" };
  }
}
