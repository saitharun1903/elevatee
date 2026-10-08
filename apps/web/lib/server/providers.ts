import "server-only";
import { aiProviderHealth, getAIProvider, getResearchProvider, researchProviderHealth } from "@elevate/core/server";

const env = () => process.env as Record<string, string | undefined>;

export const ai = () => getAIProvider(env());
export const research = () => getResearchProvider(env());
export const aiHealth = () => aiProviderHealth(env());
export const researchHealth = () => researchProviderHealth(env());

/** What the UI may say about provider availability — names only, never values. */
export function capabilities() {
  const a = ai();
  const r = research();
  return {
    ai: a ? { provider: a.id, model: a.model } : null,
    research: r ? { provider: r.id } : null,
  };
}
