/**
 * Side panel controller.
 *
 * Flow: find the active tab → ask the service worker whether the user granted it (icon click) →
 * capture once for a local preview (quickDetect, nothing leaves the browser) → on Analyze,
 * capture again and send to Elevate → follow progress → render the server's result.
 *
 * Every async step is bounded and ends in a terminal state with a way forward (Retry / Connect).
 */
import { quickDetect, type QuickDetectResult } from "@elevate/core/extraction";
import { APP_URL, SENTRY_DSN, TIMEOUTS, VERSION, appLinks } from "../config";
import { ApiClient, ApiError } from "../lib/api";
import type { RawCapture } from "../lib/capture";
import { createReporter } from "../lib/report";
import { SESSION_KEY, SessionStore, type Session } from "../lib/session";
import { watchAnalysis, type WatchUpdate } from "../lib/watch";
import { isGrantedBroadcast, type CaptureReply, type PanelRequest, type TabAccessReply } from "../shared/messages";
import type { AnalyzeResponse } from "../shared/types";
import { strings as S } from "./strings";
import { deriveResult, deriveStages, type ResultVM } from "./view-model";
import * as V from "./views";

type TabState =
  | { kind: "checking" }
  | { kind: "no_grant" }
  | { kind: "unreadable"; reason: string }
  | { kind: "reading" }
  | { kind: "capture_error"; message: string }
  | { kind: "preview"; detect: QuickDetectResult; selectionLength: number }
  | { kind: "submitting" }
  | { kind: "not_a_job"; message: string }
  | { kind: "watching"; job: AnalyzeResponse; notice: string | null; update: WatchUpdate | null; title: string | null }
  | { kind: "loading_result"; job: AnalyzeResponse; notice: string | null }
  | { kind: "result"; vm: ResultVM; notice: string | null }
  | { kind: "error"; message: string; retry: () => void; jobId: string | null };

const reporter = createReporter({ dsn: SENTRY_DSN, release: VERSION, environment: APP_URL.startsWith("http://localhost") ? "development" : "production" });
window.addEventListener("error", (e) => reporter.capture(e.error ?? e.message, "panel.error"));
window.addEventListener("unhandledrejection", (e) => reporter.capture(e.reason, "panel.unhandledrejection"));

const sessions = new SessionStore({ storage: chrome.storage.local, appUrl: APP_URL, refreshTimeoutMs: TIMEOUTS.refreshMs });
const api = new ApiClient({ appUrl: APP_URL, tokens: sessions, defaultTimeoutMs: TIMEOUTS.defaultMs });

const app = document.getElementById("app") as HTMLElement;
const tabStates = new Map<number, TabState>();
let currentTabId: number | null = null;
let windowId: number | null = null;
let session: Session | null = null;
let sessionNotice: string | null = null;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ApiError("timeout", S.panelTimeout)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

function ask<T>(req: PanelRequest): Promise<T> {
  return withTimeout(chrome.runtime.sendMessage(req) as Promise<T>, TIMEOUTS.captureMs + 5_000);
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message || S.genericError;
  return S.genericError;
}

function setState(tabId: number, state: TabState): void {
  tabStates.set(tabId, state);
  if (tabId === currentTabId) render();
}

function stateOf(tabId: number): TabState | undefined {
  return tabStates.get(tabId);
}

const actions: V.Actions = {
  connect: () => void chrome.tabs.create({ url: appLinks.connect() }),
  signOut: () => {
    void sessions.clear();
  },
  analyze: () => {
    if (currentTabId !== null) void analyze(currentTabId);
  },
  retry: () => {
    if (currentTabId !== null) void checkTab(currentTabId, true);
  },
  openUrl: (url: string) => {
    // Only ever open Elevate's own pages.
    if (url.startsWith(`${APP_URL}/`)) void chrome.tabs.create({ url });
  },
};

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function render(): void {
  const state: TabState = currentTabId === null ? { kind: "checking" } : stateOf(currentTabId) ?? { kind: "checking" };
  const main = bodyFor(state);
  app.replaceChildren(V.header(session, actions), main);
  V.animateScores(main);
}

function bodyFor(state: TabState): HTMLElement {
  const el = document.createElement("main");
  el.className = "body";
  if (!session && sessionNotice) el.appendChild(V.message({ title: sessionNotice }));
  el.appendChild(view(state));
  return el;
}

function retryButton(onClick: () => void): HTMLButtonElement {
  return V.secondaryButton(S.retry, onClick);
}

function view(state: TabState): HTMLElement {
  switch (state.kind) {
    case "checking":
      return V.busy(S.checking);
    case "reading":
      return V.busy(S.readingPage);
    case "no_grant":
      return V.message({ title: S.noGrantTitle, body: S.noGrantBody, detail: S.noGrantWhy });
    case "unreadable":
      return V.message({ title: S.unreadableTitle, body: S.unreadableBody[state.reason] ?? S.noGrantBody });
    case "capture_error":
      return V.message({ title: S.captureFailed, body: state.message, tone: "error", actions: [retryButton(actions.retry)] });
    case "preview":
      return V.preview({ detect: state.detect, selectionLength: state.selectionLength, signedIn: !!session, a: actions });
    case "submitting":
      return V.busy(S.sending);
    case "not_a_job":
      return V.message({ title: S.notAJobServerTitle, body: state.message, detail: S.notAJobHint, tone: "error", actions: [retryButton(actions.analyze)] });
    case "watching":
      return V.progress({
        notice: state.notice,
        stages: deriveStages(state.update?.stages),
        via: state.update?.via ?? null,
        hasStatus: !!state.update,
        jobTitle: state.title,
      });
    case "loading_result":
      return V.busy(S.loadingResult, state.notice);
    case "result":
      return V.result(state.vm, { notice: state.notice, fullUrl: appLinks.job(state.vm.jobId), profileUrl: appLinks.profile(), a: actions });
    case "error": {
      const jobId = state.jobId;
      return V.message({
        title: S.genericError,
        body: state.message,
        tone: "error",
        actions: [retryButton(state.retry), jobId ? V.secondaryButton(S.openFull, () => actions.openUrl(appLinks.job(jobId))) : null],
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Tab access + preview
// ---------------------------------------------------------------------------------------------

async function captureTab(tabId: number): Promise<RawCapture | TabState> {
  let reply: CaptureReply;
  try {
    reply = await ask<CaptureReply>({ type: "panel:capture", tabId });
  } catch (e) {
    return { kind: "capture_error", message: errorMessage(e) };
  }
  if (!reply || typeof reply !== "object") return { kind: "capture_error", message: S.captureFailed };
  if (reply.ok) return reply.capture;
  if (reply.reason === "no_grant") return { kind: "no_grant" };
  if (reply.reason === "unreadable") return { kind: "unreadable", reason: reply.message };
  return { kind: "capture_error", message: reply.message || S.captureFailed };
}

/** Check whether we may read the tab and, if so, build the local preview. */
async function checkTab(tabId: number, force = false): Promise<void> {
  const existing = stateOf(tabId);
  const busyKinds = ["submitting", "watching", "loading_result", "reading"];
  if (!force && existing && existing.kind !== "checking" && existing.kind !== "no_grant") return;
  if (existing && busyKinds.includes(existing.kind)) return;
  setState(tabId, { kind: "checking" });
  let access: TabAccessReply;
  try {
    access = await ask<TabAccessReply>({ type: "panel:tab-access", tabId });
  } catch (e) {
    setState(tabId, { kind: "capture_error", message: errorMessage(e) });
    return;
  }
  if (!access?.granted) return setState(tabId, { kind: "no_grant" });
  if (!access.access.readable) return setState(tabId, { kind: "unreadable", reason: access.access.reason });

  setState(tabId, { kind: "reading" });
  const cap = await captureTab(tabId);
  if (!("html" in cap)) return setState(tabId, cap);
  let detect: QuickDetectResult;
  try {
    detect = quickDetect({ url: cap.url, html: cap.html });
  } catch (e) {
    reporter.capture(e, "panel.quickDetect");
    detect = { isLikelyJob: false, title: null, company: null, location: null, platform: "company_site", confidence: "low" };
  }
  setState(tabId, { kind: "preview", detect, selectionLength: cap.selectionText?.trim().length ?? 0 });
}

// ---------------------------------------------------------------------------------------------
// Analyze → progress → result
// ---------------------------------------------------------------------------------------------

function handleAuthError(tabId: number, e: unknown): boolean {
  if (e instanceof ApiError && e.code === "session_expired") {
    sessionNotice = S.connectAfterExpiry;
    void sessions.clear();
    void checkTab(tabId, true);
    return true;
  }
  return false;
}

async function analyze(tabId: number): Promise<void> {
  if (!session) return actions.connect();
  const prev = stateOf(tabId);
  const title = prev?.kind === "preview" ? prev.detect.title : null;
  setState(tabId, { kind: "submitting" });
  const cap = await captureTab(tabId);
  if (!("html" in cap)) return setState(tabId, cap);

  let job: AnalyzeResponse;
  try {
    job = await api.analyze(
      {
        url: cap.url,
        html: cap.html,
        title: cap.title || undefined,
        ...(cap.selectionText ? { selectionText: cap.selectionText } : {}),
        capturedAt: new Date().toISOString(),
      },
      TIMEOUTS.analyzeMs,
    );
  } catch (e) {
    if (handleAuthError(tabId, e)) return;
    if (e instanceof ApiError && e.code === "not_a_job") return setState(tabId, { kind: "not_a_job", message: e.message });
    if (!(e instanceof ApiError)) reporter.capture(e, "panel.analyze");
    return setState(tabId, { kind: "error", message: errorMessage(e), retry: () => void analyze(tabId), jobId: null });
  }
  if (!job || typeof job.jobId !== "string" || typeof job.analysisId !== "string") {
    return setState(tabId, { kind: "error", message: S.genericError, retry: () => void analyze(tabId), jobId: null });
  }
  const notice = job.deduplicated ? S.deduplicated : null;
  await follow(tabId, job, notice, title);
}

async function follow(tabId: number, job: AnalyzeResponse, notice: string | null, title: string | null): Promise<void> {
  setState(tabId, { kind: "watching", job, notice, update: null, title });
  try {
    await watchAnalysis({
      api,
      analysisId: job.analysisId,
      jobId: job.jobId,
      timeouts: {
        sseConnectMs: TIMEOUTS.sseConnectMs,
        sseIdleMs: TIMEOUTS.sseIdleMs,
        pollIntervalMs: TIMEOUTS.pollIntervalMs,
        pollRequestMs: TIMEOUTS.pollRequestMs,
        totalMs: TIMEOUTS.watchTotalMs,
      },
      onUpdate: (update) => {
        const s = stateOf(tabId);
        if (s?.kind === "watching" && s.job.analysisId === job.analysisId) setState(tabId, { ...s, update });
      },
    });
  } catch (e) {
    if (handleAuthError(tabId, e)) return;
    return setState(tabId, { kind: "error", message: errorMessage(e), retry: () => void follow(tabId, job, notice, title), jobId: job.jobId });
  }
  await loadResult(tabId, job, notice);
}

async function loadResult(tabId: number, job: AnalyzeResponse, notice: string | null): Promise<void> {
  setState(tabId, { kind: "loading_result", job, notice });
  try {
    const ws = await api.getWorkspace(job.jobId);
    setState(tabId, { kind: "result", vm: deriveResult(ws), notice });
  } catch (e) {
    if (handleAuthError(tabId, e)) return;
    if (!(e instanceof ApiError)) reporter.capture(e, "panel.workspace");
    setState(tabId, { kind: "error", message: errorMessage(e), retry: () => void loadResult(tabId, job, notice), jobId: job.jobId });
  }
}

// ---------------------------------------------------------------------------------------------
// Startup + listeners
// ---------------------------------------------------------------------------------------------

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await withTimeout(chrome.tabs.query({ active: true, currentWindow: true }), 5_000);
  return tab;
}

async function start(): Promise<void> {
  render();
  try {
    session = await sessions.get();
  } catch {
    session = null;
  }
  try {
    const tab = await activeTab();
    windowId = tab?.windowId ?? null;
    currentTabId = tab?.id ?? null;
  } catch {
    currentTabId = null;
  }
  if (currentTabId === null) {
    app.replaceChildren(V.header(session, actions), V.message({ title: S.noGrantTitle, body: S.noGrantBody }));
    return;
  }
  render();
  await checkTab(currentTabId);
}

chrome.tabs.onActivated.addListener((info) => {
  if (windowId !== null && info.windowId !== windowId) return;
  currentTabId = info.tabId;
  // Only tab ids are known here; nothing is read from the tab unless the user clicked the icon on it.
  const existing = stateOf(info.tabId);
  if (existing) render();
  else void checkTab(info.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!isGrantedBroadcast(msg)) return;
  if (windowId !== null && msg.windowId !== windowId) return;
  // The user clicked the icon on this tab: (re)build the preview unless an analysis is running.
  currentTabId = msg.tabId;
  void checkTab(msg.tabId, true);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(SESSION_KEY in changes)) return;
  void sessions.get().then((s) => {
    session = s;
    if (s) sessionNotice = null;
    render();
  });
});

void start();
