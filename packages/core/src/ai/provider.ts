import type { z } from "zod";
import { ElevateError } from "../util/errors";
import { TIMEOUTS, withTimeout } from "../util/timeout";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  /** Ask the model for a single JSON object. */
  json: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface ProviderHealth {
  id: string;
  configured: boolean;
  /** Names of env vars that must be set to enable the provider. Never their values. */
  requiredEnv: string[];
  model: string | null;
}

/** Pull the first JSON object out of model text (handles code fences and leading prose). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Ask the provider for JSON and validate it against `schema`.
 * Retries once with the validation error so the model can correct its shape.
 * Never fills in missing data: invalid output becomes an ElevateError.
 */
export async function generateStructured<T>(
  provider: AIProvider,
  opts: {
    label: string;
    system: string;
    user: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<{ data: T; provider: string; model: string }> {
  const messages: ChatMessage[] = [{ role: "user", content: opts.user }];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await withTimeout(
      opts.label,
      opts.timeoutMs ?? TIMEOUTS.ai,
      (signal) =>
        provider.complete({
          system: opts.system,
          messages,
          json: true,
          temperature: opts.temperature ?? 0.1,
          maxOutputTokens: opts.maxOutputTokens ?? 4096,
          signal,
        }),
      opts.signal,
    );
    try {
      const parsed = opts.schema.safeParse(extractJsonObject(result.text));
      if (parsed.success) return { data: parsed.data, provider: result.provider, model: result.model };
      lastError = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : "invalid JSON";
    }
    messages.push(
      { role: "assistant", content: result.text.slice(0, 4000) },
      {
        role: "user",
        content: `Your previous reply did not match the required JSON shape (${lastError}). Reply again with only the corrected JSON object. Use null or empty arrays for anything not present in the input — do not invent values.`,
      },
    );
  }
  throw new ElevateError("ai_output_invalid", `${opts.label}: the AI provider returned output that could not be validated.`, {
    details: { validation: lastError },
  });
}

export async function providerFetch(
  providerId: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new ElevateError("provider_error", `${providerId} could not be reached.`, { cause });
  }
  if (!res.ok) {
    // Only status codes are surfaced; provider bodies can echo request content.
    const status = res.status;
    const msg =
      status === 401 || status === 403
        ? `${providerId} rejected the configured credentials.`
        : status === 429
          ? `${providerId} rate limit reached. Try again shortly.`
          : `${providerId} returned an error (${status}).`;
    throw new ElevateError(status === 429 ? "rate_limited" : "provider_error", msg, { details: { status, provider: providerId } });
  }
  return res;
}
