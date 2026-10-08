import { z } from "zod";
import { ElevateError } from "@elevate/core";
import { json, open, preflight, readJson } from "@/lib/server/http";
import { createAnonClient } from "@/lib/server/supabase";

export const OPTIONS = preflight;

/**
 * POST /api/v1/auth/refresh — exchanges an extension's refresh token for a new session.
 * The extension never holds any server secret; it only holds the user's own session tokens.
 */
export const POST = open("auth.refresh", async (req) => {
  const body = await readJson(req, z.object({ refreshToken: z.string().min(10).max(2000) }));
  const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token: body.refreshToken });
  if (error || !data.session) throw new ElevateError("unauthorized", "Your extension session expired. Reconnect it from Elevate settings.");
  return json(req, {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    email: data.user?.email ?? null,
  });
});
