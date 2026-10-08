import { ElevateError } from "../util/errors";
import type { AIProvider, CompletionRequest, CompletionResult, ProviderHealth } from "./provider";
import { providerFetch } from "./provider";

type Env = Record<string, string | undefined>;

const DEFAULT_GEMINI_MODELS = "gemini-3.5-flash-lite,gemini-3.8-flash,gemini-3.5-flash";
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    }, { once: true });
  });

/**
 * Gemini with an ordered model list (GEMINI_MODEL accepts "a,b,c"). Overloaded (503/429) models
 * get one short retry, then the next model is tried; retired models (404) are skipped.
 */
class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly model: string;
  constructor(
    private readonly apiKey: string,
    private readonly models: string[],
  ) {
    this.model = models[0]!;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let last: unknown;
    for (const model of this.models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await this.call(model, req);
        } catch (err) {
          last = err;
          if (req.signal?.aborted) throw err;
          const status = err instanceof ElevateError ? (err.details?.status as number | undefined) : undefined;
          if (status === 503 || status === 429 || status === 500) {
            if (attempt === 0) await sleep(1200, req.signal);
            continue;
          }
          if (status === 404 || (err instanceof ElevateError && err.code === "provider_error" && /empty|truncated/.test(err.userMessage))) break;
          throw err;
        }
      }
    }
    throw last instanceof ElevateError
      ? new ElevateError(last.code, `${last.userMessage} All configured Gemini models were tried.`, { details: last.details })
      : new ElevateError("provider_error", "Gemini is unavailable right now. Try again shortly.");
  }

  private async call(model: string, req: CompletionRequest): Promise<CompletionResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await providerFetch("Gemini", url, {
      method: "POST",
      signal: req.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: Math.max(req.maxOutputTokens ?? 4096, 4096),
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (body.promptFeedback?.blockReason) {
      throw new ElevateError("provider_error", "Gemini declined to process this content.");
    }
    const cand = body.candidates?.[0];
    const text = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
    if (!text) {
      throw new ElevateError("provider_error", cand?.finishReason === "MAX_TOKENS" ? "Gemini's response was truncated." : "Gemini returned an empty response.");
    }
    return { text, provider: this.id, model };
  }
}

/** OpenRouter and any OpenAI-compatible chat completions endpoint. */
class OpenAICompatibleProvider implements AIProvider {
  constructor(
    readonly id: string,
    private readonly label: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await providerFetch(this.label, `${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: req.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders },
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxOutputTokens ?? 4096,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
    const text = body.choices?.[0]?.message?.content ?? "";
    if (!text) throw new ElevateError("provider_error", `${this.label} returned an empty response.`);
    return { text, provider: this.id, model: body.model ?? this.model };
  }
}

interface ProviderSpec {
  id: string;
  requiredEnv: string[];
  model: (env: Env) => string | null;
  create: (env: Env) => AIProvider;
}

const SPECS: ProviderSpec[] = [
  {
    id: "gemini",
    requiredEnv: ["GEMINI_API_KEY"],
    model: (env) => env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS,
    create: (env) =>
      new GeminiProvider(
        env.GEMINI_API_KEY!,
        (env.GEMINI_MODEL || DEFAULT_GEMINI_MODELS).split(",").map((m) => m.trim()).filter(Boolean),
      ),
  },
  {
    id: "openrouter",
    requiredEnv: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"],
    model: (env) => env.OPENROUTER_MODEL || null,
    create: (env) =>
      new OpenAICompatibleProvider("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", env.OPENROUTER_API_KEY!, env.OPENROUTER_MODEL!, {
        ...(env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": env.NEXT_PUBLIC_APP_URL } : {}),
        "X-Title": "Elevate",
      }),
  },
  {
    id: "openai_compatible",
    requiredEnv: ["AI_COMPAT_BASE_URL", "AI_COMPAT_API_KEY", "AI_COMPAT_MODEL"],
    model: (env) => env.AI_COMPAT_MODEL || null,
    create: (env) =>
      new OpenAICompatibleProvider("openai_compatible", "AI provider", env.AI_COMPAT_BASE_URL!, env.AI_COMPAT_API_KEY!, env.AI_COMPAT_MODEL!),
  },
];

const isConfigured = (spec: ProviderSpec, env: Env) => spec.requiredEnv.every((k) => !!env[k]?.trim());

/** Ordered by AI_PROVIDER_ORDER (comma separated ids) or the default order above. */
function orderedSpecs(env: Env): ProviderSpec[] {
  const order = (env.AI_PROVIDER_ORDER ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (order.length === 0) return SPECS;
  return [...SPECS].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** The active AI provider, or null when none is configured. Callers must handle null honestly. */
export function getAIProvider(env: Env): AIProvider | null {
  const spec = orderedSpecs(env).find((s) => isConfigured(s, env));
  return spec ? spec.create(env) : null;
}

export function aiProviderHealth(env: Env): ProviderHealth[] {
  return orderedSpecs(env).map((s) => ({
    id: s.id,
    configured: isConfigured(s, env),
    requiredEnv: s.requiredEnv,
    model: isConfigured(s, env) ? s.model(env) : null,
  }));
}

export const AI_UNAVAILABLE_REASON =
  "No AI provider is configured. Set GEMINI_API_KEY, or OPENROUTER_API_KEY + OPENROUTER_MODEL, on the server.";
