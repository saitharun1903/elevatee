import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "./auth";

export interface Viewer {
  id: string;
  email: string | null;
  db: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>["db"];
  locale: string;
  timezone: string | null;
  country: string | null;
  currency: string | null;
}

/** The signed-in user with their formatting preferences. Redirects to sign-in when missing. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const { data } = await user.db.from("profiles").select("locale, timezone, country, currency").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email,
    db: user.db,
    locale: data?.locale ?? "en",
    timezone: data?.timezone ?? null,
    country: data?.country ?? null,
    currency: data?.currency ?? null,
  };
});
