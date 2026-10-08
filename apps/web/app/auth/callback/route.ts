import { NextResponse } from "next/server";
import { createCookieClient } from "@/lib/server/supabase";

/** Exchanges the magic-link / OAuth code for a session cookie, then continues to `next`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/home";
  // Only allow same-site relative redirects.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";
  if (code) {
    const db = await createCookieClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=callback", url.origin));
}
