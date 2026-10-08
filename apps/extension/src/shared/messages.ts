/** Internal messages between the side panel and the service worker (same extension only). */
import type { PageAccess, RawCapture } from "../lib/capture";

export type PanelRequest =
  | { type: "panel:tab-access"; tabId: number }
  | { type: "panel:capture"; tabId: number };

export interface TabAccessReply {
  granted: boolean;
  access: PageAccess;
}

export type CaptureReply =
  | { ok: true; capture: RawCapture }
  | { ok: false; reason: "no_grant" | "unreadable" | "failed"; message: string };

/** Broadcast by the service worker after the user clicks the toolbar icon on a tab. */
export interface GrantedBroadcast {
  type: "sw:granted";
  tabId: number;
  windowId: number;
}

export function isPanelRequest(m: unknown): m is PanelRequest {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return (o.type === "panel:tab-access" || o.type === "panel:capture") && typeof o.tabId === "number" && Number.isInteger(o.tabId) && o.tabId >= 0;
}

export function isGrantedBroadcast(m: unknown): m is GrantedBroadcast {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return o.type === "sw:granted" && typeof o.tabId === "number" && typeof o.windowId === "number";
}
