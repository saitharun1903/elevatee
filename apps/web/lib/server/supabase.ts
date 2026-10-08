import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ElevateError } from "@elevate/core";
import { isSupabaseConfigured, publicEnv } from "../env";

export type Db = SupabaseClient;

function assertConfigured() {
  if (!isSupabaseConfigured()) {
    throw new ElevateError("provider_unavailable", "The database isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

/** Cookie-session client for Server Components, Server Actions and Route Handlers. RLS applies. */
export async function createCookieClient(): Promise<Db> {
  assertConfigured();
  const store = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are refreshed by proxy.ts instead.
        }
      },
    },
  });
}

/**
 * Client bound to a user's access token (extension requests and background pipeline work).
 * Uses the public anon key + the user's JWT, so row level security still applies.
 */
export function createTokenClient(accessToken: string): Db {
  assertConfigured();
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Anonymous client (used only for auth endpoints like token refresh). */
export function createAnonClient(): Db {
  assertConfigured();
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
