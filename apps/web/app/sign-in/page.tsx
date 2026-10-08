import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { SignInForm } from "./sign-in-form";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { getT } from "@/lib/i18n";

const t = getT();
export const metadata: Metadata = { title: t("nav.signIn") };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/home";
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Wordmark />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-24">
        <h1 className="font-display text-h1">{t("auth.title")}</h1>
        <p className="mt-3 text-ink-2">{t("auth.lede")}</p>
        <div className="mt-8">
          {isSupabaseConfigured() ? (
            <SignInForm next={next} google={publicEnv.googleAuth} callbackError={sp.error === "callback"} />
          ) : (
            <p role="alert" className="border-l-2 border-signal pl-3 text-small text-ink-2">
              {t("auth.notConfigured")}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
