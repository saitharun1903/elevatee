import { authed, json, preflight } from "@/lib/server/http";
import { JobListQuery, listJobs } from "@/lib/server/services/jobs";

export const OPTIONS = preflight;

/** GET /api/v1/jobs?view=all|saved|applications|archived&q=&sort=&status= */
export const GET = authed("jobs.list", async (ctx) => {
  const q = JobListQuery.parse(Object.fromEntries(new URL(ctx.req.url).searchParams));
  return json(ctx.req, { jobs: await listJobs(ctx.db, q) });
});
