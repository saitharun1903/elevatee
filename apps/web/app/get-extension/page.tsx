import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { getT } from "@/lib/i18n";

const t = getT();
export const metadata: Metadata = { title: t("landing.ctaSecondary") };

/** Public page describing the extension. Store links appear only when they are configured. */
export default function GetExtension() {
  const stores = [
    { href: publicEnv.extensionStoreUrl, label: t("getExtension.chrome") },
    { href: publicEnv.edgeAddonsUrl, label: t("getExtension.edge") },
  ].filter((s) => s.href);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8">
        <Wordmark />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 pb-24 pt-10">
        <h1 className="font-display text-h1">{t("getExtension.title")}</h1>
        <p className="text-ink-2">{t("getExtension.lede")}</p>
        <ul className="flex flex-col gap-3 border-t border-ink pt-4 text-small text-ink-2">
          <li>{t("getExtension.p1")}</li>
          <li>{t("getExtension.p2")}</li>
          <li>{t("getExtension.p3")}</li>
        </ul>
        {stores.length ? (
          <div className="flex flex-wrap gap-3">
            {stores.map((s) => (
              <ButtonLink key={s.label} href={s.href} external size="lg">
                {s.label}
              </ButtonLink>
            ))}
          </div>
        ) : (
          <p className="border-l-2 border-line-strong pl-3 text-small text-ink-3">{t("getExtension.notPublished")}</p>
        )}
      </main>
    </div>
  );
}
