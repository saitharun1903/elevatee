import "server-only";
import * as Sentry from "@sentry/nextjs";
import { generateStructured, searchWithTimeout } from "@elevate/core/server";
import { z } from "zod";
import { isSupabaseConfigured } from "../env";
import type { Db } from "./supabase";
import { ai, aiHealth, research, researchHealth } from "./providers";
import { checkStorage, storageConfigured, storageRequiredEnv } from "./storage";
import { sentryEnabled } from "./monitoring";

export type CheckState = "verified" | "failed" | "unconfigured" | "configured";

export interface Check {
  key: "database" | "ai" | "research" | "storage" | "sentry";
  state: CheckState;
  provider: string | null;
  detail: string;
  requiredEnv: string[];
  latencyMs: number | null;
}

export function canViewDiagnostics(email: string | null): boolean {
  if (process.env.DIAGNOSTICS_OPEN === "true" && process.env.NODE_ENV !== "production") return true;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
}

/** Static configuration state — never reports a provider as working. */
export function configurationState(): Check[] {
  const a = aiHealth();
  const r = researchHealth();
  const activeAi = a.find((p) => p.configured);
  const activeResearch = r.find((p) => p.configured);
  return [
    { key: "database", state: isSupabaseConfigured() ? "configured" : "unconfigured", provider: "supabase", detail: "", requiredEnv: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], latencyMs: null },
    { key: "ai", state: activeAi ? "configured" : "unconfigured", provider: activeAi?.id ?? null, detail: activeAi?.model ?? "", requiredEnv: a.map((p) => p.requiredEnv.join(" + ")), latencyMs: null },
    { key: "research", state: activeResearch ? "configured" : "unconfigured", provider: activeResearch?.id ?? null, detail: "", requiredEnv: r.map((p) => p.requiredEnv.join(" + ")), latencyMs: null },
    { key: "storage", state: storageConfigured() ? "configured" : "unconfigured", provider: "cloudflare-r2", detail: "", requiredEnv: [storageRequiredEnv.join(" + ")], latencyMs: null },
    { key: "sentry", state: sentryEnabled() ? "configured" : "unconfigured", provider: "sentry", detail: "", requiredEnv: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"], latencyMs: null },
  ];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
}

/** Run real requests against each configured provider. Triggered explicitly by an admin. */
export async function runChecks(db: Db): Promise<Check[]> {
  const base = configurationState();
  const run = async (c: Check): Promise<Check> => {
    if (c.state === "unconfigured") return c;
    try {
      switch (c.key) {
        case "database": {
          const { value, ms } = await timed(async () => await db.from("profiles").select("id", { head: true, count: "exact" }));
          return value.error ? { ...c, state: "failed", detail: value.error.message } : { ...c, state: "verified", detail: "Query succeeded", latencyMs: ms };
        }
        case "ai": {
          const provider = ai()!;
          const { value, ms } = await timed(() =>
            generateStructured(provider, { label: "AI health check", system: "Reply with JSON only.", user: 'Return {"ok": true}.', schema: z.object({ ok: z.literal(true) }), maxOutputTokens: 20, timeoutMs: 40_000 }),
          );
          return { ...c, state: "verified", detail: `${value.model} responded`, latencyMs: ms };
        }
        case "research": {
          const provider = research()!;
          const { value, ms } = await timed(() => searchWithTimeout(provider, "careers page job posting", { maxResults: 1 }));
          return { ...c, state: "verified", detail: `${value.length} result(s)`, latencyMs: ms };
        }
        case "storage": {
          const { value, ms } = await timed(checkStorage);
          return { ...c, state: value.ok ? "verified" : "failed", detail: value.detail, latencyMs: ms };
        }
        case "sentry": {
          Sentry.captureMessage("Elevate diagnostics check", "info");
          const { value, ms } = await timed(() => Sentry.flush(5000));
          return { ...c, state: value ? "verified" : "failed", detail: value ? "Test event delivered" : "Event could not be flushed", latencyMs: ms };
        }
      }
    } catch (e) {
      return { ...c, state: "failed", detail: e instanceof Error ? e.message : "Check failed" };
    }
  };
  return Promise.all(base.map(run));
}
