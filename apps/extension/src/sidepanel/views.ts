/**
 * Rendering for each panel state. Pure DOM construction from view state; no network, no storage.
 */
import { h, icon } from "./dom";
import { strings as S } from "./strings";
import type { EvidenceType } from "../shared/types";
import type { MatchVM, ProcessVM, QuestionVM, ResultVM, StageVM } from "./view-model";
import type { QuickDetectResult } from "@elevate/core/extraction";

export interface Actions {
  connect(): void;
  signOut(): void;
  analyze(): void;
  retry(): void;
  openUrl(url: string): void;
}

export function header(session: { email: string | null } | null, a: Actions): HTMLElement {
  return h(
    "header",
    { class: "top" },
    h("div", { class: "brand" }, icon("mark"), h("span", { class: "brand-name" }, S.brand)),
    session
      ? h(
          "div",
          { class: "account" },
          h("span", { class: "account-email", title: session.email ?? "" }, session.email ?? S.signedIn),
          h("button", { class: "link-btn", type: "button", onclick: () => a.signOut() }, S.signOut),
        )
      : h("button", { class: "link-btn strong", type: "button", onclick: () => a.connect() }, S.connect),
  );
}

export function evidence(type: EvidenceType, label?: string): HTMLElement {
  return h("span", { class: `ev ev-${type}` }, h("i", { class: "ev-mark", "aria-hidden": "true" }), label ?? S.evidenceLabels[type] ?? type);
}

export function primaryButton(label: string, onClick: () => void, extra?: { disabled?: boolean; trailing?: boolean }): HTMLButtonElement {
  return h("button", { class: "btn btn-primary", type: "button", onclick: onClick, disabled: extra?.disabled ?? false }, h("span", null, label), extra?.trailing === false ? null : icon("arrow"));
}

export function secondaryButton(label: string, onClick: () => void): HTMLButtonElement {
  return h("button", { class: "btn btn-secondary", type: "button", onclick: onClick }, label);
}

export function busy(message: string, sub?: string | null): HTMLElement {
  return h(
    "section",
    { class: "state state-busy", role: "status", "aria-live": "polite" },
    h("div", { class: "busy-line", "aria-hidden": "true" }),
    h("p", { class: "state-title" }, message),
    sub ? h("p", { class: "muted" }, sub) : null,
  );
}

export function message(opts: { title: string; body?: string | null; detail?: string | null; tone?: "neutral" | "error"; actions?: (Node | null)[] }): HTMLElement {
  return h(
    "section",
    { class: `state state-${opts.tone ?? "neutral"}`, role: opts.tone === "error" ? "alert" : "status" },
    h("h2", { class: "state-title" }, opts.title),
    opts.body ? h("p", { class: "state-body" }, opts.body) : null,
    opts.detail ? h("p", { class: "muted small" }, opts.detail) : null,
    opts.actions?.length ? h("div", { class: "actions" }, opts.actions) : null,
  );
}

export function connectCard(a: Actions, lead: string): HTMLElement {
  return h("section", { class: "connect" }, h("p", { class: "connect-lead" }, lead), primaryButton(S.connect, () => a.connect()));
}

function jobHeading(title: string | null, company: string | null, location: string | null, eyebrow: string | null): HTMLElement {
  return h(
    "div",
    { class: "job" },
    eyebrow ? h("p", { class: "eyebrow" }, eyebrow) : null,
    h("h1", { class: "job-title" }, title ?? S.untitledRole),
    h("p", { class: "job-meta" }, [company ?? S.companyUnknown, location].filter(Boolean).join(" · ")),
  );
}

export function preview(opts: {
  detect: QuickDetectResult;
  selectionLength: number;
  signedIn: boolean;
  a: Actions;
}): HTMLElement {
  const { detect, a } = opts;
  const platform = S.platforms[detect.platform] ?? detect.platform;
  const eyebrow = `${S.detectedOn(platform)} · ${S.confidence[detect.confidence] ?? ""}`;
  const selection =
    opts.selectionLength >= 200 ? h("p", { class: "note note-info" }, S.selectionInUse(opts.selectionLength)) : opts.selectionLength > 0 ? h("p", { class: "note" }, S.selectionTooShort) : null;

  if (!detect.isLikelyJob) {
    return h(
      "section",
      { class: "preview" },
      message({ title: S.notJobTitle, body: S.notJobBody }),
      detect.title ? jobHeading(detect.title, detect.company, detect.location, null) : null,
      selection,
      opts.signedIn ? h("div", { class: "actions" }, secondaryButton(S.analyzeAnyway, () => a.analyze())) : connectCard(a, S.connectToAnalyze),
    );
  }
  return h(
    "section",
    { class: "preview" },
    jobHeading(detect.title, detect.company, detect.location, eyebrow),
    selection,
    opts.signedIn ? h("div", { class: "actions" }, primaryButton(S.analyze, () => a.analyze())) : connectCard(a, S.connectToAnalyze),
    h("p", { class: "muted small" }, S.privacyNote),
  );
}

export function stageList(stages: StageVM[]): HTMLElement | null {
  if (!stages.length) return null;
  return h(
    "ol",
    { class: "stages" },
    stages.map((s) =>
      h(
        "li",
        { class: `stage stage-${s.outcome}` },
        h("span", { class: "stage-dot", "aria-hidden": "true" }),
        h("span", { class: "stage-label" }, S.stageLabels[s.key] ?? s.key),
        h("span", { class: "stage-outcome" }, S.outcomeLabels[s.outcome] ?? s.outcome),
        s.reason && s.outcome !== "completed" && s.outcome !== "running" ? h("span", { class: "stage-reason" }, s.reason) : null,
      ),
    ),
  );
}

export function progress(opts: { notice: string | null; stages: StageVM[]; via: "stream" | "poll" | null; hasStatus: boolean; jobTitle: string | null }): HTMLElement {
  return h(
    "section",
    { class: "progress", "aria-live": "polite" },
    opts.notice ? h("p", { class: "note note-info" }, opts.notice) : null,
    opts.jobTitle ? h("h1", { class: "job-title" }, opts.jobTitle) : null,
    h("div", { class: "progress-head" }, h("p", { class: "eyebrow" }, S.analyzing), opts.via ? h("span", { class: "eyebrow muted" }, S.liveVia[opts.via]) : null),
    opts.hasStatus && opts.stages.length ? stageList(opts.stages) : busy(S.waitingForServer),
  );
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

function score(label: string, value: number | null): HTMLElement {
  return h(
    "div",
    { class: "score" },
    h("span", { class: "score-label" }, label),
    value === null
      ? h("span", { class: "score-value is-missing", "aria-label": `${label}: not available` }, S.scoreMissing)
      : h("span", { class: "score-value", "data-score": value, "aria-label": `${label}: ${value} out of 100` }, "0"),
    value === null ? null : h("span", { class: "score-unit" }, S.estimate),
  );
}

function matchBlock(title: string, m: MatchVM | null, tone: "match" | "gap"): HTMLElement {
  return h(
    "div",
    { class: `match match-${tone}` },
    h("p", { class: "eyebrow" }, title),
    m
      ? [
          h("p", { class: "match-req" }, m.requirement),
          h(
            "p",
            { class: "match-meta" },
            h("span", null, m.importance === "required" ? S.required : S.preferred),
            m.status === "partial" ? h("span", { class: "tag tag-partial" }, S.partialMatch) : null,
          ),
          m.quote ? h("blockquote", { class: "quote" }, h("span", { class: "quote-text" }, m.quote), evidence("verified", S.fromResume)) : null,
        ]
      : h("p", { class: "muted" }, S.scoreMissing),
  );
}

function section(title: string, count: string | null, body: Node, open = false): HTMLDetailsElement {
  return h(
    "details",
    { class: "fold", open },
    h("summary", null, h("span", { class: "fold-title" }, title), count ? h("span", { class: "fold-count" }, count) : null, icon("chevron")),
    h("div", { class: "fold-body" }, body),
  );
}

function processBody(p: ProcessVM): HTMLElement {
  const label = p.source === "company" ? S.processCompany : p.source === "similar" ? S.processSimilar : S.processPredicted;
  return h(
    "div",
    { class: p.source === "predicted" ? "predicted" : "" },
    h("p", { class: "fold-note" }, p.source === "predicted" ? evidence("predicted", label) : label),
    h(
      "ol",
      { class: "steps" },
      p.steps.map((s) =>
        h("li", { class: "step" }, h("span", { class: "step-text" }, s.text), s.detail ? h("span", { class: "step-detail" }, s.detail) : null, p.source !== "predicted" ? evidence(s.evidence) : null),
      ),
    ),
  );
}

function questionsBody(qs: QuestionVM[]): HTMLElement {
  if (!qs.length) return h("p", { class: "muted" }, S.noQuestions);
  return h(
    "ol",
    { class: "questions" },
    qs.map((q) =>
      h(
        "li",
        { class: `question${q.origin === "predicted" ? " predicted" : ""}` },
        h("p", { class: "question-text" }, q.text),
        h("p", { class: "question-meta" }, evidence(q.evidence, S.originLabels[q.origin]), q.category ? h("span", { class: "muted" }, q.category) : null),
      ),
    ),
  );
}

export function result(vm: ResultVM, opts: { notice: string | null; fullUrl: string; profileUrl: string; a: Actions }): HTMLElement {
  const eyebrow = [vm.company, vm.location, vm.workplaceType ? S.workplace[vm.workplaceType] ?? null : null].filter(Boolean).join(" · ") || null;
  const statusNote =
    vm.status === "PARTIAL" ? S.statusPartial : vm.status === "FAILED" ? S.statusFailed : vm.status === "TIMEOUT" ? S.statusTimeout : null;

  let rec: HTMLElement;
  if (vm.recommendation.kind === "value") {
    rec = h("p", { class: `rec-value rec-${vm.recommendation.value}` }, S.recommendationLabels[vm.recommendation.value] ?? vm.recommendation.value);
  } else if (vm.recommendation.kind === "no_resume") {
    rec = h(
      "div",
      { class: "rec-empty" },
      h("p", { class: "rec-value is-missing" }, S.addResume),
      h("a", { class: "link", href: opts.profileUrl, onclick: (e: Event) => { e.preventDefault(); opts.a.openUrl(opts.profileUrl); } }, S.addResumeLink, icon("external")),
    );
  } else {
    rec = h("div", { class: "rec-empty" }, h("p", { class: "rec-value is-missing" }, S.recommendationUnavailable), vm.recommendation.reason ? h("p", { class: "muted small" }, vm.recommendation.reason) : null);
  }

  const unfinished = vm.stages.filter((s) => s.outcome !== "completed" && s.outcome !== "running" && s.outcome !== "pending");

  return h(
    "section",
    { class: "result" },
    opts.notice ? h("p", { class: "note note-info" }, opts.notice) : null,
    h("div", { class: "job" }, eyebrow ? h("p", { class: "eyebrow" }, eyebrow) : null, h("h1", { class: "job-title" }, vm.title ?? S.untitledRole)),
    statusNote ? h("div", { class: "note note-caution", role: "status" }, h("p", null, statusNote), vm.analysisError ? h("p", { class: "small" }, vm.analysisError) : null) : null,
    h("div", { class: "verdict" }, h("p", { class: "eyebrow" }, S.recommendation), rec, h("div", { class: "scores" }, score(S.fit, vm.fit), score(S.ats, vm.ats))),
    h("div", { class: "matches" }, matchBlock(S.topMatch, vm.topMatch, "match"), matchBlock(S.topGap, vm.topGap, "gap")),
    section(S.process, vm.process ? S.steps(vm.process.steps.length) : S.scoreMissing, vm.process ? processBody(vm.process) : h("p", { class: "muted" }, S.scoreMissing)),
    section(S.questions, vm.questions.length ? S.questionsCount(vm.questions.length, vm.questionTotal) : null, questionsBody(vm.questions)),
    unfinished.length ? section(S.incompleteStages, String(unfinished.length), stageList(unfinished) ?? h("span")) : null,
    h("div", { class: "actions actions-end" }, primaryButton(S.openFull, () => opts.a.openUrl(opts.fullUrl))),
  );
}

/** Count scores up from 0 to the server value. Instant when the user prefers reduced motion. */
export function animateScores(root: HTMLElement): void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-score]"))) {
    const target = Number(el.dataset.score);
    if (!Number.isFinite(target)) continue;
    if (reduce) {
      el.textContent = String(target);
      continue;
    }
    const start = performance.now();
    const dur = 700;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
