"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "../env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser Supabase client (anon key only). Used for auth flows; data goes through the API. */
export function browserSupabase() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return null;
  client ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return client;
}
