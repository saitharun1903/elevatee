/**
 * Elevate service worker.
 *
 * - Toolbar click: opens the side panel (synchronously, inside the user gesture) and records
 *   that this tab was granted activeTab. Nothing is read from the page here.
 * - Capture: only when the side panel asks, for a tab the user clicked the icon on.
 * - External messages: session hand-off from the Elevate web app (exact origin only).
 *
 * There are no content scripts, no tab/navigation listeners that read pages, and no API calls
 * to Elevate from here (the side panel makes them).
 */
import { APP_ORIGIN, APP_URL, SENTRY_DSN, TIMEOUTS, VERSION } from "./config";
import { capturePage, classifyUrl, validateRawCapture, type RawCapture } from "./lib/capture";
import { handleExternalMessage } from "./lib/external";
import { GrantStore } from "./lib/grants";
import { createReporter } from "./lib/report";
import { SessionStore } from "./lib/session";
import { isPanelRequest, type CaptureReply, type GrantedBroadcast, type TabAccessReply } from "./shared/messages";

const reporter = createReporter({ dsn: SENTRY_DSN, release: VERSION, environment: APP_URL.startsWith("http://localhost") ? "development" : "production" });
const sessions = new SessionStore({ storage: chrome.storage.local, appUrl: APP_URL });
const grants = new GrantStore(chrome.storage.session);

self.addEventListener("unhandledrejection", (e) => reporter.capture((e as PromiseRejectionEvent).reason, "sw.unhandledrejection"));
self.addEventListener("error", (e) => reporter.capture((e as ErrorEvent).error ?? (e as ErrorEvent).message, "sw.error"));

chrome.runtime.onInstalled.addListener(() => {
  // We open the panel ourselves from action.onClicked so the click grants activeTab.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((e) => reporter.capture(e, "sw.setPanelBehavior"));
});

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (tabId === undefined || tabId < 0) return;
  // Must be called synchronously in the gesture: no await before this line.
  const opening = chrome.sidePanel.open({ tabId });
  const recorded = grants.grant(tabId, tab.url);
  Promise.all([opening, recorded])
    .then(() => {
      const msg: GrantedBroadcast = { type: "sw:granted", tabId, windowId: tab.windowId };
      // The panel may not be loaded yet; it then checks access itself on startup.
      return chrome.runtime.sendMessage(msg).catch(() => {});
    })
    .catch((e) => reporter.capture(e, "sw.actionClick"));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  grants.revoke(tabId).catch(() => {});
});

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function tabAccess(tabId: number): Promise<TabAccessReply> {
  const g = await grants.get(tabId);
  if (!g) return { granted: false, access: { readable: true } };
  return { granted: true, access: g.access };
}

async function capture(tabId: number): Promise<CaptureReply> {
  const g = await grants.get(tabId);
  if (!g) return { ok: false, reason: "no_grant", message: "No access to this tab." };
  if (!g.access.readable) return { ok: false, reason: "unreadable", message: g.access.reason };
  let result: unknown;
  try {
    const results = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId }, func: capturePage as () => RawCapture, args: [] }),
      TIMEOUTS.captureMs,
      "Reading the page took too long.",
    );
    result = results[0]?.result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cannot access|cannot be scripted|permission|activeTab|no tab with id|extensions gallery/i.test(msg)) {
      // The grant no longer applies (navigated, closed, or a protected page).
      await grants.revoke(tabId).catch(() => {});
      return { ok: false, reason: "no_grant", message: "No access to this tab." };
    }
    reporter.capture(e, "sw.capture");
    return { ok: false, reason: "failed", message: msg.slice(0, 300) };
  }
  const cap = validateRawCapture(result);
  if (!cap) return { ok: false, reason: "failed", message: "The page could not be read." };
  const access = classifyUrl(cap.url);
  if (!access.readable) return { ok: false, reason: "unreadable", message: access.reason };
  return { ok: true, capture: cap };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own extension pages (the side panel). There are no content scripts.
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  if (!isPanelRequest(message)) return false;
  const work = message.type === "panel:capture" ? capture(message.tabId) : tabAccess(message.tabId);
  work.then(sendResponse, (e) => {
    reporter.capture(e, "sw.message");
    sendResponse({ ok: false, reason: "failed", message: "Something went wrong reading the page." } satisfies CaptureReply);
  });
  return true; // async response
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleExternalMessage(message, sender, {
    appOrigin: APP_ORIGIN,
    version: VERSION,
    saveSession: (s) => sessions.set(s),
    clearSession: () => sessions.clear(),
  }).then(sendResponse, (e) => {
    reporter.capture(e, "sw.external");
    sendResponse({ ok: false, error: "internal_error" });
  });
  return true;
});
