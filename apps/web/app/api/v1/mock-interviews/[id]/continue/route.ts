import { z } from "zod";
import { authed, json, preflight } from "@/lib/server/http";
import { continueMockInterview } from "@/lib/server/services/workflow";

export const maxDuration = 60;
export const OPTIONS = preflight;

/** POST /api/v1/mock-interviews/:id/continue — fetch the next question if the last one failed to save. */
export const POST = authed<{ id: string }>("mock_interviews.continue", async (ctx) =>
  json(ctx.req, await continueMockInterview(ctx, z.string().uuid().parse(ctx.params.id))),
);
