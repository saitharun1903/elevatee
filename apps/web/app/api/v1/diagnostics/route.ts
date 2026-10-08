import { ElevateError } from "@elevate/core";
import { authed, json } from "@/lib/server/http";
import { canViewDiagnostics, configurationState, runChecks } from "@/lib/server/diagnostics";

export const maxDuration = 60;

/** GET /api/v1/diagnostics — configuration state only (no provider calls). */
export const GET = authed("diagnostics.get", async (ctx) => {
  if (!canViewDiagnostics(ctx.email)) throw new ElevateError("unauthorized", "Diagnostics are restricted to administrators.", { status: 403 });
  return json(ctx.req, { checks: configurationState() });
});

/** POST /api/v1/diagnostics — run live checks against every configured provider. */
export const POST = authed("diagnostics.run", async (ctx) => {
  if (!canViewDiagnostics(ctx.email)) throw new ElevateError("unauthorized", "Diagnostics are restricted to administrators.", { status: 403 });
  return json(ctx.req, { checks: await runChecks(ctx.db), checkedAt: new Date().toISOString() });
});
