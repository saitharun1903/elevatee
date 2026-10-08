import { z } from "zod";
import { authed, json, preflight } from "@/lib/server/http";
import { getMockInterview } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** GET /api/v1/mock-interviews/:id — session with turns and feedback. */
export const GET = authed<{ id: string }>("mock_interviews.get", async (ctx) =>
  json(ctx.req, await getMockInterview(ctx.db, z.string().uuid().parse(ctx.params.id))),
);
