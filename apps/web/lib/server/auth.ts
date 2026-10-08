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

/** Authenticate an API request by bearer token (extension) or session cookie (web). */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const db = createTokenClient(token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new ElevateError("unauthorized", "Your session has expired. Sign in again.");
    return { userId: data.user.id, email: data.user.email ?? null, db, accessToken: token, via: "bearer" };
  }
  const db = await createCookieClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ElevateError("unauthorized", "Sign in to continue.");
  const { data: session } = await db.auth.getSession();
  const accessToken = session.session?.access_token;
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
