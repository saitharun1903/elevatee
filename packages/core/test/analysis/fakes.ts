/**
 * Test doubles for the pipeline. They derive every answer from the prompt they receive,
 * so any cross-job contamination would surface as foreign text in the output.
 * One deliberately fabricated item per response checks that verification drops it.
 */
import type { AIProvider, CompletionRequest, CompletionResult } from "../../src/ai/provider";
import type { ResearchProvider, SearchHit } from "../../src/research/providers";
import type { AnalysisStore, CandidateBundle, ResearchBundle, Stages } from "../../src/pipeline/analysis";
import type { AnalysisEventType, AnalysisStatus, InterviewQuestion, JobIntelligence, NormalizedJob, RoleClassification } from "../../src/schemas";

export const FABRICATED = "Must hold a NASA astronaut certification";

const block = (text: string, tag: string) => text.match(new RegExp(`<untrusted_${tag}>\\n([\\s\\S]*?)\\n</untrusted_${tag}>`))?.[1] ?? "";

export class FakeAI implements AIProvider {
  readonly id = "fake";
  readonly model = "fake-1";
  calls: string[] = [];
  constructor(private readonly opts: { fail?: boolean; delayMs?: number } = {}) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (this.opts.delayMs) {
      await new Promise((r, rej) => {
        const t = setTimeout(r, this.opts.delayMs);
        req.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          rej(req.signal?.reason ?? new Error("aborted"));
        });
      });
    }
    if (this.opts.fail) throw new Error("provider down");
    const user = req.messages[0]!.content;
    this.calls.push(req.system.slice(0, 40));
    const out = (o: unknown) => ({ text: JSON.stringify(o), provider: this.id, model: this.model });

    if (req.system.includes("job analyst")) {
      const posting = block(user, "job_posting");
      const title = posting.match(/^Title: (.+)$/m)?.[1] ?? null;
      const bullets = posting.split("\n").filter((l) => l.startsWith("- ") || l.startsWith("• ")).map((l) => l.replace(/^[-•]\s+/, "").trim());
      return out({
        proposed: null,
        summary: title ? `Works as ${title}.` : null,
        classification: { jobFamily: title, function: null, domain: null, seniority: null, isTechnical: /engineer/i.test(title ?? ""), rationale: null },
        requirements: [...bullets.map((b) => ({ text: b, kind: "other", importance: "required", quote: b })), { text: FABRICATED, kind: "other", importance: "required", quote: FABRICATED }],
        skills: bullets.map((b) => ({ name: b.split(" ").slice(0, 2).join(" "), aliases: [], importance: "required", category: "other", quote: b })),
        education: null,
        experienceYears: null,
        prepTopics: [{ topic: `Prepare: ${bullets[0] ?? "role"}`, why: "Stated requirement", requirementIndexes: [0] }],
      });
    }
    if (req.system.includes("research analyst")) {
      const listing = block(user, "research_sources");
      const first = listing.split("\n")[1] ?? "";
      const quote = first.split(". ")[0] ?? first;
      return out({
        claims: [
          { kind: "process_step", text: quote, order: 1, category: null, sources: [1], quote, aboutThisCompany: true },
          { kind: "question", text: "Invented question nobody reported?", order: null, category: "behavioral", sources: [1], quote: "this text is not in any snippet", aboutThisCompany: true },
        ],
      });
    }
    if (req.system.includes("interview coach")) {
      const ids = [...user.matchAll(/(req_\d+) \[\w+\] (.+)/g)];
      return out({ questions: ids.slice(0, 3).map((m) => ({ text: `Tell me about your experience with ${m[2]}`, category: "experience", basisRequirementIds: [m[1]], why: "Requirement" })), process: [] });
    }
    if (req.system.includes("compare ONE candidate")) {
      const resume = block(user, "resume");
      const reqs = [...user.matchAll(/(req_\d+) \[\w+\] \(\w+\) (.+)/g)];
      return out({
        matches: reqs.map((m, i) => {
          const word = m[2]!.split(" ")[0]!;
          const line = resume.split("\n").find((l) => l.toLowerCase().includes(word.toLowerCase()));
          // The last requirement gets a fabricated quote to test downgrade-to-gap.
          if (i === reqs.length - 1) return { requirementId: m[1], status: "match", resumeQuote: "Led NASA moon mission", rationale: "x" };
          return line ? { requirementId: m[1], status: "match", resumeQuote: line.trim(), rationale: "Shown in resume" } : { requirementId: m[1], status: "gap", resumeQuote: null, rationale: null };
        }),
      });
    }
    throw new Error(`unexpected prompt: ${req.system.slice(0, 60)}`);
  }
}

export class FakeResearch implements ResearchProvider {
  readonly id = "fake-search";
  queries: string[] = [];
  constructor(private readonly opts: { fail?: boolean } = {}) {}
  async search(query: string): Promise<SearchHit[]> {
    this.queries.push(query);
    if (this.opts.fail) throw new Error("search down");
    const company = query.match(/"([^"]+)"/)?.[1] ?? "role";
    const slug = company.toLowerCase().replace(/[^a-z]/g, "");
    return [{ url: `https://www.glassdoor.com/${slug}/${encodeURIComponent(query).slice(0, 20)}`, title: `${company} interviews`, snippet: `${company} interview starts with a recruiter call. Then a panel.`, publishedAt: null }];
  }
}

export class MemoryStore implements AnalysisStore {
  status: AnalysisStatus = "CREATED";
  stages: Stages = {};
  error: { code: string; message: string } | null = null;
  events: AnalysisEventType[] = [];
  intel: JobIntelligence | null = null;
  classification: RoleClassification | null = null;
  research: ResearchBundle | null = null;
  questions: InterviewQuestion[] = [];
  candidate: CandidateBundle | null = null;
  constructor(public job: NormalizedJob) {}
  async setStatus(status: AnalysisStatus, patch: { stages: Stages; error?: { code: string; message: string } | null }) {
    this.status = status;
    this.stages = structuredClone(patch.stages);
    if (patch.error !== undefined) this.error = patch.error;
  }
  async emit(type: AnalysisEventType) {
    this.events.push(type);
  }
  async saveIntelligence(d: { intel: JobIntelligence; classification: RoleClassification | null }) {
    this.intel = d.intel;
    this.classification = d.classification;
  }
  async applyProposedJobFields() {
    return this.job;
  }
  async getResearch() {
    return this.research;
  }
  async saveResearch(d: ResearchBundle) {
    this.research = d;
    return d;
  }
  async saveQuestions(d: { questions: InterviewQuestion[] }) {
    this.questions = d.questions;
  }
  async saveCandidate(d: CandidateBundle) {
    this.candidate = d;
  }
  /** Every string the store holds, for contamination checks. */
  dump(): string {
    return JSON.stringify({ intel: this.intel, cls: this.classification, research: this.research, q: this.questions, c: this.candidate });
  }
}

export function job(over: Partial<NormalizedJob>): NormalizedJob {
  return {
    canonicalUrl: null,
    sourcePlatform: "manual",
    sourceJobId: null,
    title: null,
    company: null,
    companyWebsite: null,
    location: null,
    country: null,
    workplaceType: null,
    employmentType: null,
    postedAt: null,
    validThrough: null,
    description: null,
    responsibilities: [],
    requiredQualifications: [],
    preferredQualifications: [],
    benefits: [],
    education: null,
    experience: null,
    salary: null,
    applicationUrl: null,
    ...over,
  };
}
