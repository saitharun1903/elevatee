import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, runCandidatePipeline } from "../../src/pipeline/analysis";
import { FABRICATED, FakeAI, FakeResearch, MemoryStore, job } from "./fakes";

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const ENGINEER = job({
  title: "Senior Software Engineer",
  company: "Acme Payments",
  location: "Bengaluru, India",
  description: "Build payment APIs.\n- TypeScript services in production\n- PostgreSQL schema design\n- Kubernetes deployments",
});

const NURSE = job({
  title: "Registered Nurse",
  company: "St Mary's Hospital",
  location: "Manchester, United Kingdom",
  description: "Ward nursing on an acute medical unit.\n- NMC registration\n- Medication administration\n- Patient safety and escalation",
});

const RESUME = `Priya Sharma
priya@example.com +91 98765 43210
Experience
Software Engineer, Lumen Labs, 2019-01 to present
TypeScript services serving 2M users
PostgreSQL migrations and query tuning
Education
B.Tech Computer Science`;

describe("analysis pipeline", () => {
  it("analyzes two unrelated jobs with zero cross-contamination", async () => {
    const ai = new FakeAI();
    const research = new FakeResearch();
    const a = new MemoryStore(ENGINEER);
    const b = new MemoryStore(NURSE);
    await runAnalysisPipeline({ ai, research, store: a, newId }, { job: ENGINEER, resume: null });
    await runAnalysisPipeline({ ai, research, store: b, newId }, { job: NURSE, resume: null });

    const dumpB = b.dump();
    for (const foreign of ["Acme", "TypeScript", "PostgreSQL", "Kubernetes", "Bengaluru", "Software Engineer", "payment"]) {
      expect(dumpB).not.toContain(foreign);
    }
    const dumpA = a.dump();
    for (const foreign of ["St Mary", "NMC", "Medication", "Manchester", "Nurse"]) {
      expect(dumpA).not.toContain(foreign);
    }
    expect(b.intel!.requirements.map((r) => r.text)).toEqual(["NMC registration", "Medication administration", "Patient safety and escalation"]);
    expect(research.queries.filter((q) => q.includes("St Mary")).length).toBeGreaterThan(0);
  });

  it("drops AI items whose quotes are not in the posting or sources", async () => {
    const store = new MemoryStore(ENGINEER);
    await runAnalysisPipeline({ ai: new FakeAI(), research: new FakeResearch(), store, newId }, { job: ENGINEER, resume: null });
    expect(store.intel!.requirements.some((r) => r.text === FABRICATED)).toBe(false);
    expect(store.intel!.droppedUnverified).toBe(1);
    expect(store.research!.claims.some((c) => c.text.includes("Invented question"))).toBe(false);
    expect(store.questions.filter((q) => q.origin === "predicted").every((q) => q.evidence.type === "predicted")).toBe(true);
  });

  it("without a resume: no candidate comparison, no ATS, no fit", async () => {
    const store = new MemoryStore(ENGINEER);
    const status = await runAnalysisPipeline({ ai: new FakeAI(), research: new FakeResearch(), store, newId }, { job: ENGINEER, resume: null });
    expect(status).toBe("COMPLETED");
    expect(store.candidate).toBeNull();
    expect(store.stages.candidate?.outcome).toBe("skipped");
    expect(store.stages.ats?.outcome).toBe("skipped");
    expect(store.events).not.toContain("ats_completed");
  });

  it("with a resume: ATS and fit come from the actual resume, fabricated evidence becomes a gap", async () => {
    const store = new MemoryStore(ENGINEER);
    await runAnalysisPipeline({ ai: new FakeAI(), research: new FakeResearch(), store, newId }, { job: ENGINEER, resume: { versionId: "v1", text: RESUME, parsed: null } });
    const c = store.candidate!;
    expect(c.resumeVersionId).toBe("v1");
    const byText = Object.fromEntries(c.matches!.map((m) => [m.requirementText, m]));
    expect(byText["TypeScript services in production"]!.status).toBe("match");
    expect(byText["TypeScript services in production"]!.resumeQuote).toBe("TypeScript services serving 2M users");
    const last = c.matches!.at(-1)!;
    expect(last.status).toBe("gap");
    expect(last.downgraded).toBe(true);
    expect(c.fit.score).not.toBeNull();
    expect(c.ats.keywords.find((k) => k.name.startsWith("TypeScript"))!.found).toBe(true);
    expect(c.ats.keywords.find((k) => k.name.startsWith("Kubernetes"))!.found).toBe(false);
  });

  it("recalculates when the resume is replaced", async () => {
    const store = new MemoryStore(ENGINEER);
    await runAnalysisPipeline({ ai: new FakeAI(), research: null, store, newId }, { job: ENGINEER, resume: { versionId: "v1", text: RESUME, parsed: null } });
    const first = store.candidate!;
    const v2 = `${RESUME}\nKubernetes deployments with Helm`;
    await runCandidatePipeline({ ai: new FakeAI(), research: null, store, newId }, { job: ENGINEER, intel: store.intel!, resume: { versionId: "v2", text: v2, parsed: null }, previousStages: store.stages });
    expect(store.candidate!.resumeVersionId).toBe("v2");
    expect(store.candidate!.ats.keywords.find((k) => k.name.startsWith("Kubernetes"))!.found).toBe(true);
    expect(first.ats.keywords.find((k) => k.name.startsWith("Kubernetes"))!.found).toBe(false);
  });

  it("AI unavailable: PARTIAL with structured requirements only, never invented content", async () => {
    const j = job({ ...NURSE, requiredQualifications: ["NMC registration"] });
    const store = new MemoryStore(j);
    const status = await runAnalysisPipeline({ ai: null, research: null, store, newId }, { job: j, resume: { versionId: "v1", text: RESUME, parsed: null } });
    expect(status).toBe("PARTIAL");
    expect(store.intel!.requirements.map((r) => r.text)).toEqual(["NMC registration"]);
    expect(store.intel!.skills).toEqual([]);
    expect(store.questions).toEqual([]);
    expect(store.stages.research?.outcome).toBe("unavailable");
    expect(store.stages.candidate?.outcome).toBe("unavailable");
    expect(store.candidate!.fit.score).toBeNull();
  });

  it("AI failure is recorded and the pipeline still finishes", async () => {
    const store = new MemoryStore(ENGINEER);
    const status = await runAnalysisPipeline({ ai: new FakeAI({ fail: true }), research: new FakeResearch({ fail: true }), store, newId }, { job: ENGINEER, resume: null });
    expect(status).toBe("PARTIAL");
    expect(store.stages.classification?.outcome).toBe("failed");
    expect(store.stages.research?.outcome).toBe("failed");
    expect(store.events.at(-1)).toBe("analysis_completed");
  });

  it("hard deadline ends in TIMEOUT, never pending", async () => {
    const store = new MemoryStore(ENGINEER);
    const status = await runAnalysisPipeline({ ai: new FakeAI({ delayMs: 5_000 }), research: null, store, newId, totalTimeoutMs: 100 }, { job: ENGINEER, resume: null });
    expect(status).toBe("TIMEOUT");
    expect(store.status).toBe("TIMEOUT");
    expect(Object.values(store.stages).some((s) => s?.outcome === "running")).toBe(false);
    expect(store.events).toContain("analysis_timeout");
  });

  it("reuses fresh research instead of calling the provider again", async () => {
    const research = new FakeResearch();
    const store = new MemoryStore(ENGINEER);
    await runAnalysisPipeline({ ai: new FakeAI(), research, store, newId }, { job: ENGINEER, resume: null });
    const calls = research.queries.length;
    await runAnalysisPipeline({ ai: new FakeAI(), research, store, newId }, { job: ENGINEER, resume: null });
    expect(research.queries.length).toBe(calls);
    await runAnalysisPipeline({ ai: new FakeAI(), research, store, newId }, { job: ENGINEER, resume: null, forceResearch: true });
    expect(research.queries.length).toBeGreaterThan(calls);
  });

  it("skips company research when the employer is unknown", async () => {
    const j = job({ ...NURSE, company: null });
    const research = new FakeResearch();
    const store = new MemoryStore(j);
    await runAnalysisPipeline({ ai: new FakeAI(), research, store, newId }, { job: j, resume: null });
    expect(research.queries.every((q) => !q.includes('"'))).toBe(true);
  });
});
