import { TIMEOUTS } from "../util/timeout";
import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import { QuoteIndex } from "../analysis/evidence";
import type { EvidenceType, NormalizedJob, ResearchClaim, ResearchSource, RoleClassification, SourceKind } from "../schemas";
import type { ResearchProvider, SearchHit } from "./providers";
import { searchWithTimeout } from "./providers";

export type QueryScope = "company" | "role";
export interface ResearchQuery {
  q: string;
  scope: QueryScope;
  purpose: "process" | "questions" | "company" | "news" | "salary";
}

/** Research queries come only from this job's own fields. Nothing from other jobs is ever mixed in. */
export function buildQueries(job: NormalizedJob, classification: RoleClassification | null): ResearchQuery[] {
  const title = job.title?.replace(/\s*[\(\[].*?[\)\]]\s*/g, " ").replace(/\s+/g, " ").trim() ?? null;
  const company = job.company?.trim() ?? null;
  const place = job.location?.split(/[,|]/)[0]?.trim() ?? null;
  const queries: ResearchQuery[] = [];
  if (company && title) {
    queries.push({ q: `"${company}" ${title} interview process`, scope: "company", purpose: "process" });
    queries.push({ q: `"${company}" ${title} interview questions`, scope: "company", purpose: "questions" });
  }
  if (company) {
    queries.push({ q: `"${company}" company overview what they do`, scope: "company", purpose: "company" });
    queries.push({ q: `"${company}" news`, scope: "company", purpose: "news" });
    if (title) queries.push({ q: `"${company}" ${title} salary${place ? ` ${place}` : ""}`, scope: "company", purpose: "salary" });
  }
  if (title) {
    const family = classification?.jobFamily && !title.toLowerCase().includes(classification.jobFamily.toLowerCase()) ? ` ${classification.jobFamily}` : "";
    queries.push({ q: `${title}${family} interview questions and process`, scope: "role", purpose: "questions" });
  }
  return queries;
}

const CANDIDATE_DOMAINS = ["glassdoor.", "ambitionbox.com", "teamblind.com", "leetcode.com", "reddit.com", "quora.com", "indeed.com", "comparably.com", "kununu.com", "levels.fyi", "naukri.com", "interviewquery.com", "prepinsta.com", "geeksforgeeks.org"];
const COMMUNITY_DOMAINS = ["reddit.com", "quora.com", "teamblind.com", "medium.com", "dev.to", "stackexchange.com", "facebook.com", "x.com", "twitter.com"];
const PUBLICATION_DOMAINS = ["reuters.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com", "bbc.", "theguardian.com", "economictimes.", "livemint.com", "thehindu.com", "business-standard.com", "cnbc.com", "forbes.com", "techcrunch.com", "theverge.com", "apnews.com", "businessinsider.com", "fortune.com", "moneycontrol.com", "handelsblatt.com", "lesechos.fr", "afr.com", "nikkei.com", "scmp.com", "gulfnews.com", "thenationalnews.com", "straitstimes.com"];
const AGGREGATOR_DOMAINS = ["levels.fyi", "payscale.com", "salary.com", "salaryexpert.com", "talent.com", "zippia.com", "simplyhired.com", "crunchbase.com", "wikipedia.org", "linkedin.com", "zoominfo.com"];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const slug = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|limited|plc|gmbh|corp|corporation|co|pvt|private|sa|ag|bv|group)\b\.?/g, "").replace(/[^a-z0-9]/g, "");

export function classifySource(url: string, job: NormalizedJob): SourceKind {
  const host = hostOf(url);
  const official = job.companyWebsite ? hostOf(job.companyWebsite) : null;
  if (official && (host === official || host.endsWith(`.${official}`))) return "official";
  const s = job.company ? slug(job.company) : "";
  const hostLabel = host.split(".").slice(-2, -1)[0] ?? "";
  if (s.length >= 4 && hostLabel === s) return "official";
  const has = (list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`) || host.startsWith(d) || host.includes(`.${d}`));
  if (has(CANDIDATE_DOMAINS) && !has(["reddit.com", "quora.com", "medium.com"])) return "candidate_report";
  if (has(COMMUNITY_DOMAINS)) return "community";
  if (has(PUBLICATION_DOMAINS)) return "publication";
  if (has(AGGREGATOR_DOMAINS)) return "aggregator";
  return "other";
}

const SOURCE_RANK: Record<SourceKind, number> = { official: 0, candidate_report: 1, publication: 2, community: 3, aggregator: 4, other: 5 };

function canonicalSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export interface GatherResult {
  sources: (ResearchSource & { scope: QueryScope })[];
  failedQueries: { q: string; error: string }[];
}

export async function gatherSources(
  provider: ResearchProvider,
  job: NormalizedJob,
  queries: ResearchQuery[],
  opts: { signal?: AbortSignal; perQuery?: number; newId: () => string },
): Promise<GatherResult> {
  const retrievedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    queries.map((q) => searchWithTimeout(provider, q.q, { maxResults: opts.perQuery ?? 6, country: job.country, signal: opts.signal })),
  );
  const byUrl = new Map<string, ResearchSource & { scope: QueryScope }>();
  const failedQueries: GatherResult["failedQueries"] = [];
  settled.forEach((r, i) => {
    const query = queries[i]!;
    if (r.status === "rejected") {
      failedQueries.push({ q: query.q, error: r.reason instanceof Error ? r.reason.message : "search failed" });
      return;
    }
    for (const hit of r.value as SearchHit[]) {
      if (!/^https?:\/\//.test(hit.url) || !hit.snippet.trim()) continue;
      const key = canonicalSourceUrl(hit.url);
      const existing = byUrl.get(key);
      if (existing) {
        // Same page from two queries: keep the richer snippet; company scope wins over role scope.
        if (hit.snippet.length > existing.snippet.length) existing.snippet = hit.snippet.slice(0, 4000);
        if (query.scope === "company") existing.scope = "company";
        continue;
      }
      byUrl.set(key, {
        id: opts.newId(),
        provider: provider.id,
        query: query.q,
        url: key,
        domain: hostOf(key),
        title: hit.title.slice(0, 500),
        snippet: hit.snippet.slice(0, 4000),
        kind: classifySource(key, job),
        publishedAt: hit.publishedAt,
        retrievedAt,
        scope: query.scope,
      });
    }
  });
  // Deduplicate near-identical snippets (syndicated content) and order by source quality.
  const seenSnippets = new Set<string>();
  const sources = [...byUrl.values()]
    .sort((a, b) => SOURCE_RANK[a.kind] - SOURCE_RANK[b.kind])
    .filter((s) => {
      const sig = s.snippet.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 160);
      if (seenSnippets.has(sig)) return false;
      seenSnippets.add(sig);
      return true;
    })
    .slice(0, 30);
  return { sources, failedQueries };
}

// ---------------------------------------------------------------------------
// Synthesis: AI turns snippets into claims; every claim must quote a cited snippet.
// ---------------------------------------------------------------------------

const ClaimDraft = z.object({
  claims: z
    .array(
      z.object({
        kind: z.enum(["company_fact", "process_step", "question", "salary", "development", "culture"]),
        text: z.string().min(3).max(800),
        order: z.number().int().nullable().default(null),
        category: z.string().max(80).nullable().default(null),
        sources: z.array(z.number().int().min(1)).min(1).max(5),
        quote: z.string().min(3).max(600),
        aboutThisCompany: z.boolean(),
      }),
    )
    .max(60),
});

const SYNTH_SYSTEM = `You are Elevate's research analyst. You receive numbered web search snippets about a company and a job.
Extract factual claims that a candidate preparing for THIS job would care about.
${UNTRUSTED_DATA_POLICY}
Return ONE JSON object: { "claims": [ { "kind": "company_fact"|"process_step"|"question"|"salary"|"development"|"culture",
  "text": string, "order": number|null, "category": string|null, "sources": number[], "quote": string, "aboutThisCompany": boolean } ] }
Rules:
- Every claim must be supported by the cited snippet(s). "quote" is exact contiguous text copied from one cited snippet.
- process_step: a stage of the hiring process (e.g. phone screen, case study, clinical assessment, teaching demo). "order" = position if the source states it.
- question: an interview question that a source says was asked. Copy the question. "category" e.g. behavioral, technical, clinical, case, situational.
- salary: only figures a source states, with currency and period as written.
- development: recent news (funding, layoffs, launches, acquisitions, leadership change).
- aboutThisCompany = true only if the snippet is clearly about the named company (not a similarly named one).
- Different professions have different processes; never assume a software-style process.
- If the snippets contain nothing useful, return { "claims": [] }.`;

export interface SynthesisResult {
  claims: ResearchClaim[];
  dropped: number;
  provider: string;
  model: string;
}

export async function synthesizeClaims(
  ai: AIProvider,
  job: NormalizedJob,
  sources: (ResearchSource & { scope: QueryScope })[],
  opts: { signal?: AbortSignal; newId: () => string },
): Promise<SynthesisResult> {
  if (sources.length === 0) return { claims: [], dropped: 0, provider: "", model: "" };
  const listing = sources
    .map((s, i) => `[${i + 1}] (${s.scope === "company" ? "company search" : "role search"}; ${s.domain}) ${s.title}\n${s.snippet}`)
    .join("\n\n");
  const header = `Company: ${job.company ?? "unknown"}\nJob title: ${job.title ?? "unknown"}\nLocation: ${job.location ?? "unknown"}`;
  const { data, provider, model } = await generateStructured(ai, {
    label: "Research synthesis",
    timeoutMs: TIMEOUTS.aiLong,
    system: SYNTH_SYSTEM,
    user: `${header}\n\n${fenceUntrusted("research_sources", listing, 60_000)}`,
    schema: ClaimDraft,
    maxOutputTokens: 8192,
    signal: opts.signal,
  });
  return { ...verifyClaims(data, sources, opts.newId), provider, model };
}

export function verifyClaims(
  data: z.infer<typeof ClaimDraft>,
  sources: (ResearchSource & { scope: QueryScope })[],
  newId: () => string,
): { claims: ResearchClaim[]; dropped: number } {
  const indexes = sources.map((s) => new QuoteIndex(`${s.title}\n${s.snippet}`));
  let dropped = 0;
  const claims: ResearchClaim[] = [];
  const seen = new Set<string>();
  for (const c of data.claims) {
    const cited = c.sources.map((n) => n - 1).filter((i) => i >= 0 && i < sources.length);
    const supporting = cited.filter((i) => indexes[i]!.contains(c.quote));
    const key = `${c.kind}:${c.text.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120)}`;
    if (supporting.length === 0 || seen.has(key)) {
      dropped++;
      continue;
    }
    // Company-specific claims must come from company-scoped searches about this company.
    const supportingSources = supporting.map((i) => sources[i]!);
    const companyScoped = c.aboutThisCompany && supportingSources.some((s) => s.scope === "company");
    if (c.kind !== "question" && c.kind !== "process_step" && !companyScoped) {
      dropped++;
      continue;
    }
    seen.add(key);
    const best = supportingSources.reduce((a, b) => (SOURCE_RANK[a.kind] <= SOURCE_RANK[b.kind] ? a : b));
    const type: EvidenceType =
      best.kind === "official" || best.kind === "publication" ? "source_backed" : best.kind === "aggregator" || best.kind === "other" ? "source_backed" : "candidate_reported";
    claims.push({
      id: newId(),
      kind: c.kind,
      text: c.text,
      order: c.order,
      category: c.category,
      // role scope marks questions/process evidence from role-level searches, shown as "similar".
      scope: companyScoped ? "company" : "role",
      evidence: { type, origin: "research", quote: c.quote, sourceIds: supportingSources.map((s) => s.id) },
    });
  }
  return { claims, dropped };
}

/** Research older than this is considered stale and may be refreshed on request. */
export const RESEARCH_STALE_MS = 7 * 24 * 60 * 60 * 1000;
