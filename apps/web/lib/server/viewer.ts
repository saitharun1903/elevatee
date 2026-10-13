import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "./auth";

export interface Viewer {
  id: string;
  email: string | null;
  db: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>["db"];
  locale: string;
  /** Profile time zone, else the browser's (cookie), else UTC. Always a valid IANA zone. */
  timezone: string;
  /** The browser-reported zone, used to keep the cookie current. */
  browserTimezone: string | null;
  country: string | null;
  currency: string | null;
}

/** The signed-in user with their formatting preferences. Redirects to sign-in when missing. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const raw = (await cookies()).get("tz")?.value;
  const browserTz = validZone(raw ? decodeURIComponent(raw) : null);
  const { data } = await user.db.from("profiles").select("locale, timezone, country, currency").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email,
    db: user.db,
    locale: data?.locale ?? "en",
    timezone: validZone(data?.timezone) ?? browserTz ?? "UTC",
    browserTimezone: browserTz,
    country: data?.country ?? null,
    currency: data?.currency ?? null,
  };
});

function validZone(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}
