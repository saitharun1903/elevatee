/** Public configuration (safe for the browser). Server secrets are read only in lib/server. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  extensionIds: (process.env.NEXT_PUBLIC_EXTENSION_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  extensionStoreUrl: process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ?? "",
  edgeAddonsUrl: process.env.NEXT_PUBLIC_EDGE_ADDONS_URL ?? "",
  googleAuth: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
};

export const isSupabaseConfigured = () => !!publicEnv.supabaseUrl && !!publicEnv.supabaseAnonKey;
