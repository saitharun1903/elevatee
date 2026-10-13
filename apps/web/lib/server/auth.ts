import "server-only";
import { ElevateError } from "@elevate/core";
import { createCookieClient, createTokenClient, type Db } from "./supabase";

export interface AuthContext {
  userId: string;
  email: string | null;
  db: Db;
  /** The user's JWT, used to run background work under the same RLS identity. */
  accessToken: string;
  via: "cookie" | "bearer";
}

/** Seconds until a JWT expires (0 if unreadable). Signature is verified separately by Supabase. */
function secondsLeft(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp - Math.floor(Date.now() / 1000) : 0;
  } catch {
    return 0;
  }
}

/**
 * Background work (analysis pipelines) runs under the request's token for up to ~5 minutes.
 * Tokens closer than this to expiry are refreshed first so writes can't fail mid-run.
 */
const MIN_TOKEN_SECONDS = 8 * 60;

/** Authenticate an API request by bearer token (extension) or session cookie (web). */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const db = createTokenClient(token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ElevateError("unauthorized", "Your session has expired. Sign in again.");
    if (secondsLeft(token) < MIN_TOKEN_SECONDS) {
      // The extension refreshes on 401 and retries once, so it gets a fresh token for the long job.
      throw new ElevateError("unauthorized", "Your session is about to expire. Refreshing…", { details: { reason: "token_expiring" } });
    }
    return { userId: data.user.id, email: data.user.email ?? null, db, accessToken: token, via: "bearer" };
  }
  const db = await createCookieClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ElevateError("unauthorized", "Sign in to continue.");
  const { data: session } = await db.auth.getSession();
  let accessToken = session.session?.access_token;
  if (accessToken && secondsLeft(accessToken) < MIN_TOKEN_SECONDS) {
    const { data: refreshed } = await db.auth.refreshSession();
    if (refreshed.session?.access_token) accessToken = refreshed.session.access_token;
  }
  if (!accessToken) throw new ElevateError("unauthorized", "Sign in to continue.");
  return { userId: data.user.id, email: data.user.email ?? null, db, accessToken, via: "cookie" };
}

/** For Server Components: the signed-in user or null. */
export async function getSessionUser(): Promise<{ id: string; email: string | null; db: Db } | null> {
  try {
    const db = await createCookieClient();
    const { data } = await db.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null, db } : null;
  } catch {
    return null;
  }
}
