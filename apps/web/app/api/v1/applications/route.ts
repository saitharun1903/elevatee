import { authed, json, preflight } from "@/lib/server/http";
import { listApplications } from "@/lib/server/services/workflow";

export const OPTIONS = preflight;

/** GET /api/v1/applications */
export const GET = authed("applications.list", async (ctx) => json(ctx.req, { applications: await listApplications(ctx.db) }));
