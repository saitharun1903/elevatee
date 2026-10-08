import { z } from "zod";
import { authed, json, preflight, readJson } from "@/lib/server/http";
import { setTaskDone } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** PATCH /api/v1/preparation-tasks/:id — { done } */
export const PATCH = authed<{ id: string }>("preparation_tasks.patch", async (ctx) => {
  const body = await readJson(ctx.req, z.object({ done: z.boolean() }));
  return json(ctx.req, await setTaskDone(ctx.db, z.string().uuid().parse(ctx.params.id), body.done));
});
