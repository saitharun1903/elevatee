import { TIMEOUTS } from "../util/timeout";
import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import { generateStructured } from "../ai/provider";
import { fenceUntrusted, UNTRUSTED_DATA_POLICY } from "../ai/untrusted";
import type { JobIntelligence, NormalizedJob, RequirementMatch } from "../schemas";
import { QuoteIndex } from "./evidence";

const Draft = z.object({
  matches: z
    .array(
      z.object({
        requirementId: z.string(),
        status: z.enum(["match", "partial", "gap"]),
        resumeQuote: z.string().max(600).nullable(),
        rationale: z.string().max(500).nullable(),
      }),
    )
    .max(80),
});

const SYSTEM = `You compare ONE candidate's resume against ONE job's requirements.
${UNTRUSTED_DATA_POLICY}
Return ONE JSON object: { "matches": [ { "requirementId": string, "status": "match"|"partial"|"gap", "resumeQuote": string|null, "rationale": string|null } ] }
- One entry per requirement id provided.
- match: the resume clearly demonstrates the requirement. partial: related or weaker evidence (adjacent skill, fewer years, different context). gap: no evidence.
- resumeQuote: exact contiguous text copied from the resume that supports match/partial. It will be checked; if you cannot quote, use status "gap".
- rationale: one short sentence, specific to this resume.
- Judge by evidence, not by keywords alone. Do not reward claims the resume does not make.`;

export async function compareCandidate(
  ai: AIProvider,
  job: NormalizedJob,
  intel: JobIntelligence,
  resumeText: string,
  signal?: AbortSignal,
): Promise<{ matches: RequirementMatch[]; provider: string; model: string }> {
  if (intel.requirements.length === 0) return { matches: [], provider: ai.id, model: ai.model };
  const reqList = intel.requirements.map((r) => `${r.id} [${r.importance}] (${r.kind}) ${r.text}`).join("\n");
  const { data, provider, model } = await generateStructured(ai, {
    label: "Candidate comparison",
    timeoutMs: TIMEOUTS.aiLong,
    system: SYSTEM,
    user: `Job: ${job.title ?? "unknown title"}${job.company ? ` at ${job.company}` : ""}\nRequirements:\n${reqList}\n\n${fenceUntrusted("resume", resumeText, 50_000)}`,
    schema: Draft,
    maxOutputTokens: 8192,
    signal,
  });
  return { matches: verifyMatches(intel, resumeText, data.matches), provider, model };
}

/** Exported for tests. Any match whose quote is not in the resume is downgraded to a gap. */
export function verifyMatches(intel: JobIntelligence, resumeText: string, drafts: z.infer<typeof Draft>["matches"]): RequirementMatch[] {
  const idx = new QuoteIndex(resumeText);
  const byId = new Map(drafts.map((d) => [d.requirementId, d]));
  return intel.requirements.map((req) => {
    const d = byId.get(req.id);
    if (!d) {
      return { requirementId: req.id, requirementText: req.text, importance: req.importance, status: "gap" as const, resumeQuote: null, rationale: null, downgraded: false };
    }
    const quoted = d.status !== "gap" && idx.contains(d.resumeQuote);
    const downgraded = d.status !== "gap" && !quoted;
    return {
      requirementId: req.id,
      requirementText: req.text,
      importance: req.importance,
      status: downgraded ? ("gap" as const) : d.status,
      resumeQuote: quoted ? d.resumeQuote : null,
      rationale: downgraded ? "The comparison claimed evidence that isn't in your resume, so this is treated as a gap." : d.rationale,
      downgraded,
    };
  });
}
