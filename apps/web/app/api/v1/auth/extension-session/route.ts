import { createClient } from "@supabase/supabase-js";
import { ElevateError } from "@elevate/core";
import { authed, json } from "@/lib/server/http";
import { publicEnv } from "@/lib/env";
import { createAnonClient } from "@/lib/server/supabase";

/**
 * POST /api/v1/auth/extension-session — mints a separate session for the browser extension.
 *
 * Sharing the web session's refresh token with the extension would make both sides rotate the
 * same token, and Supabase revokes a session when a rotated token is replayed. Instead, for the
 * already-authenticated user only, the server creates a one-time sign-in token (admin API, never
 * emailed) and exchanges it for a brand-new, independent session that only the extension holds.
 * Requires SUPABASE_SERVICE_ROLE_KEY on the server; it is used for this one call and never leaves it.
 */
export const POST = authed("auth.extension_session", async (ctx) => {
  if (ctx.via !== "cookie") throw new ElevateError("unauthorized", "Connect the extension from the Elevate website.", { status: 403 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new ElevateError("provider_unavailable", "Extension sign-in isn't configured on this server (SUPABASE_SERVICE_ROLE_KEY is missing).");
  }
  if (!ctx.email) throw new ElevateError("invalid_input", "Your account has no email address to connect with.");

  const admin = createClient(publicEnv.supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: ctx.email });
  const hashed = link?.properties?.hashed_token;
  if (linkError || !hashed || link.user?.id !== ctx.userId) {
    throw new ElevateError("internal", "Couldn't create a session for the extension. Try again.");
  }
  const { data: verified, error: verifyError } = await createAnonClient().auth.verifyOtp({ type: "magiclink", token_hash: hashed });
  const session = verified?.session;
  if (verifyError || !session || verified.user?.id !== ctx.userId) {
    throw new ElevateError("internal", "Couldn't create a session for the extension. Try again.");
  }
  return json(ctx.req, {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    email: session.user.email ?? null,
  });
});
