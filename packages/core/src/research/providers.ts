import { providerFetch, type ProviderHealth } from "../ai/provider";
import { TIMEOUTS, withTimeout } from "../util/timeout";

type Env = Record<string, string | undefined>;

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
}

export interface ResearchProvider {
  readonly id: string;
  search(query: string, opts: { maxResults: number; country?: string | null; signal?: AbortSignal }): Promise<SearchHit[]>;
}

const toIso = (s: unknown): string | null => {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

class TavilyProvider implements ResearchProvider {
  readonly id = "tavily";
  constructor(private readonly key: string) {}
  async search(query: string, opts: { maxResults: number; signal?: AbortSignal }): Promise<SearchHit[]> {
    const res = await providerFetch("Tavily", "https://api.tavily.com/search", {
      method: "POST",
      signal: opts.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ query, max_results: opts.maxResults, search_depth: "basic", include_answer: false }),
    });
    const body = (await res.json()) as { results?: { url: string; title?: string; content?: string; published_date?: string }[] };
    return (body.results ?? []).map((r) => ({
      url: r.url,
      title: r.title ?? r.url,
      snippet: r.content ?? "",
      publishedAt: toIso(r.published_date),
    }));
  }
}

class BraveProvider implements ResearchProvider {
  readonly id = "brave";
  constructor(private readonly key: string) {}
  async search(query: string, opts: { maxResults: number; country?: string | null; signal?: AbortSignal }): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q: query, count: String(Math.min(opts.maxResults, 20)), extra_snippets: "true" });
    if (opts.country) params.set("country", opts.country.toLowerCase());
    const res = await providerFetch("Brave Search", `https://api.search.brave.com/res/v1/web/search?${params}`, {
      signal: opts.signal,
      headers: { accept: "application/json", "x-subscription-token": this.key },
    });
    const body = (await res.json()) as {
      web?: { results?: { url: string; title?: string; description?: string; extra_snippets?: string[]; page_age?: string }[] };
    };
    return (body.web?.results ?? []).map((r) => ({
      url: r.url,
      title: stripTags(r.title ?? r.url),
      snippet: stripTags([r.description ?? "", ...(r.extra_snippets ?? [])].join(" … ")),
      publishedAt: toIso(r.page_age),
    }));
  }
}

class SerperProvider implements ResearchProvider {
  readonly id = "serper";
  constructor(private readonly key: string) {}
  async search(query: string, opts: { maxResults: number; country?: string | null; signal?: AbortSignal }): Promise<SearchHit[]> {
    const res = await providerFetch("Serper", "https://google.serper.dev/search", {
      method: "POST",
      signal: opts.signal,
      headers: { "content-type": "application/json", "x-api-key": this.key },
      body: JSON.stringify({ q: query, num: opts.maxResults, ...(opts.country ? { gl: opts.country.toLowerCase() } : {}) }),
    });
    const body = (await res.json()) as { organic?: { link: string; title?: string; snippet?: string; date?: string }[] };
    return (body.organic ?? []).map((r) => ({
      url: r.link,
      title: r.title ?? r.link,
      snippet: r.snippet ?? "",
      publishedAt: toIso(r.date),
    }));
  }
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

const SPECS = [
  { id: "tavily", requiredEnv: ["TAVILY_API_KEY"], create: (env: Env) => new TavilyProvider(env.TAVILY_API_KEY!) },
  { id: "brave", requiredEnv: ["BRAVE_SEARCH_API_KEY"], create: (env: Env) => new BraveProvider(env.BRAVE_SEARCH_API_KEY!) },
  { id: "serper", requiredEnv: ["SERPER_API_KEY"], create: (env: Env) => new SerperProvider(env.SERPER_API_KEY!) },
] as const;

const configured = (s: (typeof SPECS)[number], env: Env) => s.requiredEnv.every((k) => !!env[k]?.trim());

function ordered(env: Env) {
  const order = (env.RESEARCH_PROVIDER_ORDER ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!order.length) return [...SPECS];
  return [...SPECS].sort((a, b) => (order.indexOf(a.id) + 100) % 100 - (order.indexOf(b.id) + 100) % 100);
}

export function getResearchProvider(env: Env): ResearchProvider | null {
  const spec = ordered(env).find((s) => configured(s, env));
  return spec ? spec.create(env) : null;
}

export function researchProviderHealth(env: Env): ProviderHealth[] {
  return ordered(env).map((s) => ({ id: s.id, configured: configured(s, env), requiredEnv: [...s.requiredEnv], model: null }));
}

export const RESEARCH_UNAVAILABLE_REASON =
  "No research provider is configured. Set TAVILY_API_KEY, BRAVE_SEARCH_API_KEY or SERPER_API_KEY on the server.";

export async function searchWithTimeout(
  provider: ResearchProvider,
  query: string,
  opts: { maxResults: number; country?: string | null; signal?: AbortSignal },
): Promise<SearchHit[]> {
  return withTimeout(`Research search (${provider.id})`, TIMEOUTS.research, (signal) => provider.search(query, { ...opts, signal }), opts.signal);
}
