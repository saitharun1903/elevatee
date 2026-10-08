import { describe, expect, it } from "vitest";
import type { InterviewQuestion, JobWorkspace, RequirementMatch, ResearchClaim } from "../src/shared/types";
import { deriveRecommendation, deriveResult, deriveStages, selectProcess, selectQuestions, selectTopGap, selectTopMatch } from "../src/sidepanel/view-model";

const match = (over: Partial<RequirementMatch>): RequirementMatch => ({
  requirementId: over.requirementId ?? "r",
  requirementText: over.requirementText ?? "Requirement",
  importance: over.importance ?? "required",
  status: over.status ?? "match",
  resumeQuote: over.resumeQuote ?? null,
  rationale: null,
  downgraded: false,
});

const claim = (over: Partial<ResearchClaim>): ResearchClaim => ({
  id: over.id ?? "c",
  kind: over.kind ?? "process_step",
  text: over.text ?? "Step",
  order: over.order ?? null,
  category: null,
  scope: over.scope ?? "company",
  evidence: over.evidence ?? { type: "source_backed", origin: "research", quote: null, sourceIds: [] },
});

const question = (over: Partial<InterviewQuestion>): InterviewQuestion => ({
  id: over.id ?? "q",
  text: over.text ?? "Question?",
  origin: over.origin ?? "predicted",
  category: over.category ?? null,
  basis: null,
  requirementIds: [],
  evidence: over.evidence ?? { type: "predicted", origin: "elevate", quote: null, sourceIds: [] },
});

function workspace(over: Partial<JobWorkspace> = {}): JobWorkspace {
  return {
    id: "job-1",
    job: { title: "Data Analyst", company: "Acme", location: "Pune, India", workplaceType: "hybrid" } as JobWorkspace["job"],
    analysis: null,
    research: null,
    candidate: null,
    primaryResume: null,
    capabilities: { ai: null, research: null },
    ...over,
  };
}

describe("selectTopMatch / selectTopGap", () => {
  const matches = [
    match({ requirementText: "Excel", importance: "preferred", status: "match", resumeQuote: "Built Excel models" }),
    match({ requirementText: "SQL", importance: "required", status: "match", resumeQuote: null }),
    match({ requirementText: "Python", importance: "required", status: "match", resumeQuote: "Python ETL pipelines" }),
    match({ requirementText: "Tableau", importance: "preferred", status: "gap" }),
    match({ requirementText: "Statistics degree", importance: "required", status: "gap" }),
    match({ requirementText: "Stakeholders", importance: "required", status: "partial" }),
  ];

  it("prefers a required match backed by a resume quote", () => {
    expect(selectTopMatch(matches)).toEqual({ requirement: "Python", importance: "required", status: "match", quote: "Python ETL pipelines" });
  });

  it("prefers a required gap", () => {
    expect(selectTopGap(matches)).toMatchObject({ requirement: "Statistics degree", status: "gap" });
  });

  it("falls back to a partial match when there are no gaps", () => {
    expect(selectTopGap(matches.filter((m) => m.status !== "gap"))).toMatchObject({ requirement: "Stakeholders", status: "partial" });
  });

  it("returns null without matches", () => {
    expect(selectTopMatch(null)).toBeNull();
    expect(selectTopGap([])).toBeNull();
    expect(selectTopMatch([match({ status: "gap" })])).toBeNull();
  });
});

describe("selectProcess", () => {
  it("prefers company-scoped process steps, ordered, with their evidence type", () => {
    const ws = workspace({
      research: {
        status: "completed",
        provider: "p",
        note: null,
        retrievedAt: "",
        sources: [],
        claims: [
          claim({ text: "Role step", scope: "role", order: 1 }),
          claim({ text: "Onsite loop", scope: "company", order: 3 }),
          claim({ text: "Recruiter screen", scope: "company", order: 1, evidence: { type: "candidate_reported", origin: "research", quote: null, sourceIds: [] } }),
          claim({ text: "A question", kind: "question", scope: "company" }),
        ],
      },
      analysis: { predicted_process: [{ step: "Predicted screen", description: "" }] } as unknown as JobWorkspace["analysis"],
    });
    expect(selectProcess(ws)).toEqual({
      source: "company",
      steps: [
        { text: "Recruiter screen", detail: null, evidence: "candidate_reported" },
        { text: "Onsite loop", detail: null, evidence: "source_backed" },
      ],
    });
  });

  it("uses the predicted process, labeled predicted, when there are no company steps", () => {
    const ws = workspace({
      research: { status: "completed", provider: "p", note: null, retrievedAt: "", sources: [], claims: [claim({ text: "Role step", scope: "role" })] },
      analysis: { predicted_process: [{ step: "Phone screen", description: "30 minutes with a recruiter" }] } as unknown as JobWorkspace["analysis"],
    });
    expect(selectProcess(ws)).toEqual({ source: "predicted", steps: [{ text: "Phone screen", detail: "30 minutes with a recruiter", evidence: "predicted" }] });
  });

  it("falls back to similar-role steps, then null", () => {
    const ws = workspace({ research: { status: "completed", provider: "p", note: null, retrievedAt: "", sources: [], claims: [claim({ text: "Role step", scope: "role" })] } });
    expect(selectProcess(ws)?.source).toBe("similar");
    expect(selectProcess(workspace())).toBeNull();
  });
});

describe("selectQuestions", () => {
  it("takes the top 3, reported first, and always labels predicted questions as predicted", () => {
    const qs = [
      question({ text: "P1", origin: "predicted", evidence: { type: "inferred", origin: "elevate", quote: null, sourceIds: [] } }),
      question({ text: "S1", origin: "similar", evidence: { type: "source_backed", origin: "research", quote: null, sourceIds: [] } }),
      question({ text: "P2", origin: "predicted" }),
      question({ text: "R1", origin: "reported", evidence: { type: "candidate_reported", origin: "research", quote: null, sourceIds: [] } }),
    ];
    const r = selectQuestions(qs);
    expect(r.total).toBe(4);
    expect(r.items.map((q) => [q.text, q.origin, q.evidence])).toEqual([
      ["R1", "reported", "candidate_reported"],
      ["S1", "similar", "source_backed"],
      ["P1", "predicted", "predicted"],
    ]);
  });
});

describe("deriveRecommendation", () => {
  it("uses the server recommendation", () => {
    const ws = workspace({ candidate: { id: "c", resumeLabel: null, matches: [], ats: null, fit: { recommendation: "worth_applying", score: 71 } as never } });
    expect(deriveRecommendation(ws)).toEqual({ kind: "value", value: "worth_applying" });
  });

  it("asks for a resume when there is no resume and no candidate analysis", () => {
    expect(deriveRecommendation(workspace())).toEqual({ kind: "no_resume" });
  });

  it("is unavailable (with the server's reason) when a resume exists but there is no recommendation", () => {
    const ws = workspace({
      primaryResume: { versionId: "v", label: null, version: 1 },
      analysis: { stages: { fit: { outcome: "unavailable", reason: "Too few requirements to compare." } } } as unknown as JobWorkspace["analysis"],
    });
    expect(deriveRecommendation(ws)).toEqual({ kind: "unavailable", reason: "Too few requirements to compare." });
  });
});

describe("deriveResult", () => {
  it("passes scores through only when the server returned real values", () => {
    const withScores = deriveResult(workspace({ candidate: { id: "c", resumeLabel: null, matches: [], ats: { score: 64 } as never, fit: { score: 72, recommendation: "strong" } as never } }));
    expect([withScores.fit, withScores.ats]).toEqual([72, 64]);
    const without = deriveResult(workspace({ candidate: { id: "c", resumeLabel: null, matches: [], ats: { score: null } as never, fit: null } }));
    expect([without.fit, without.ats]).toEqual([null, null]);
    expect(deriveResult(workspace()).fit).toBeNull();
  });

  it("copies job fields without inventing any", () => {
    const vm = deriveResult(workspace({ job: { title: null, company: null, location: null, workplaceType: null } as unknown as JobWorkspace["job"] }));
    expect([vm.title, vm.company, vm.location, vm.workplaceType]).toEqual([null, null, null, null]);
    expect(vm.questions).toEqual([]);
    expect(vm.process).toBeNull();
  });
});

describe("deriveStages", () => {
  it("returns only reported stages, in pipeline order", () => {
    expect(
      deriveStages({
        fit: { outcome: "pending", reason: null },
        extraction: { outcome: "completed", reason: null },
        research: { outcome: "unavailable", reason: "No research provider configured" },
      }),
    ).toEqual([
      { key: "extraction", outcome: "completed", reason: null },
      { key: "research", outcome: "unavailable", reason: "No research provider configured" },
      { key: "fit", outcome: "pending", reason: null },
    ]);
    expect(deriveStages(null)).toEqual([]);
    expect(deriveStages({ ats: { outcome: "bogus" as never, reason: null } })).toEqual([]);
  });
});
