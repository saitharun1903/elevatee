import { z } from "zod";
import { PrepPlanRequest } from "@elevate/core";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { createPreparationPlan } from "@/lib/server/services/workflow";

export const maxDuration = 120;
export const OPTIONS = preflight;

/** POST /api/v1/jobs/:id/preparation — build a plan for the given number of days. */
export const POST = authed<{ id: string }>("jobs.preparation", async (ctx) => {
  const id = z.string().uuid().parse(ctx.params.id);
  const body = await readJson(ctx.req, PrepPlanRequest);
  return json(ctx.req, await createPreparationPlan(ctx, id, body), { status: 201 });
});
