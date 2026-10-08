import { authed, json, preflight } from "@/lib/server/http";
import { getHome } from "@/lib/server/services/home";

export const OPTIONS = preflight;

/** GET /api/v1/home — dashboard data from the user's real records. */
export const GET = authed("home", async (ctx) => json(ctx.req, await getHome(ctx.db)));
