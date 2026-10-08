import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n";
import { canViewDiagnostics } from "@/lib/server/diagnostics";
import { getViewer } from "@/lib/server/viewer";
import { SettingsForm } from "./settings-form";

const t = getT();
export const metadata: Metadata = { title: t("settings.title") };

export default async function SettingsPage() {
  const viewer = await getViewer();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    viewer.db.from("profiles").select("display_name, locale, country, currency, timezone").eq("id", viewer.id).maybeSingle(),
    viewer.db.from("user_preferences").select("theme, product_analytics").eq("user_id", viewer.id).maybeSingle(),
  ]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <h1 className="font-display text-h1">{t("settings.title")}</h1>
      <SettingsForm
        initial={{
          display_name: profile?.display_name ?? "",
          locale: profile?.locale ?? "",
          country: profile?.country ?? "",
          currency: profile?.currency ?? "",
          timezone: profile?.timezone ?? "",
          theme: (prefs?.theme as "system" | "light" | "dark") ?? "system",
          product_analytics: prefs?.product_analytics ?? true,
        }}
      />
      <section className="flex flex-col gap-3 border-t border-ink pt-4">
        <h2 className="text-h3 font-medium">{t("settings.extension")}</h2>
        <p className="text-small text-ink-2">{t("settings.extensionLede")}</p>
        <Link href="/extension/connect" className="self-start text-small font-medium underline decoration-line-strong underline-offset-4">
          {t("settings.connectExtension")} →
        </Link>
      </section>
      <section className="flex flex-col gap-3 border-t border-ink pt-4">
        <h2 className="text-h3 font-medium">{t("settings.account")}</h2>
        <p className="text-small text-ink-2">{t("settings.signedInAs", { email: viewer.email ?? "" })}</p>
        {canViewDiagnostics(viewer.email) ? (
          <Link href="/diagnostics" className="self-start text-small font-medium underline decoration-line-strong underline-offset-4">
            {t("settings.diagnostics")} →
          </Link>
        ) : null}
      </section>
    </div>
  );
}
