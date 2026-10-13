import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { createCookieClient } from "@/lib/server/supabase";

/** Exchanges the magic-link / OAuth code for a session cookie, then continues to `next`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only same-site paths; see safeNext for the forms it rejects.
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const db = await createCookieClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=callback", url.origin));
}
