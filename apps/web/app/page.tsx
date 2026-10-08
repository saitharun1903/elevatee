import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { WorkflowDemo } from "@/components/landing/workflow-demo";
import { publicEnv } from "@/lib/env";
import { getT } from "@/lib/i18n";
import { getSessionUser } from "@/lib/server/auth";

const t = getT();

export default async function Landing() {
  const user = await getSessionUser();
  const extensionHref = publicEnv.extensionStoreUrl || "/get-extension";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[90rem] items-center justify-between px-4 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <ButtonLink href="/home" variant="secondary" size="sm">
              {t("nav.home")}
            </ButtonLink>
          ) : (
            <ButtonLink href="/sign-in" variant="ghost" size="sm">
              {t("nav.signIn")}
            </ButtonLink>
          )}
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-[90rem] flex-1 px-4 sm:px-8">
        <section className="grid gap-10 pb-16 pt-10 sm:pt-16 lg:grid-cols-12 lg:pb-24 lg:pt-24">
          <div className="lg:col-span-8">
            <p className="eyebrow mb-6">{t("landing.eyebrow")}</p>
            <h1 className="font-display text-display">
              {t("landing.heroA")}
              <br />
              <em className="text-ink-3">{t("landing.heroEm")}</em> {t("landing.heroB")}
            </h1>
          </div>
          <div className="flex flex-col justify-end gap-6 lg:col-span-4">
            <p className="text-[1.0625rem] leading-relaxed text-ink-2">{t("landing.lede")}</p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={user ? "/analyze" : "/sign-in?next=/analyze"} size="lg">
                {t("landing.ctaPrimary")}
              </ButtonLink>
              <ButtonLink href={extensionHref} variant="secondary" size="lg" external={!!publicEnv.extensionStoreUrl}>
                {t("landing.ctaSecondary")}
              </ButtonLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="rule-top py-14 lg:py-20">
          <h2 id="how" className="eyebrow mb-8">
            {t("landing.demoLabel")}
          </h2>
          <WorkflowDemo />
        </section>

        <section aria-labelledby="principles" className="rule-top grid gap-8 py-14 lg:grid-cols-12 lg:py-20">
          <h2 id="principles" className="font-display text-h1 lg:col-span-4">
            {t("landing.principlesTitle")}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-3 lg:col-span-8">
            {[t("landing.principle1"), t("landing.principle2"), t("landing.principle3")].map((p, i) => (
              <li key={i} className="flex flex-col gap-3 border-t border-ink pt-4">
                <span className="font-mono text-meta tnum text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-ink-2">{p}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[90rem] px-4 pb-10 pt-6 text-small text-ink-3 sm:px-8">
        <div className="rule-top flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("landing.footerPrivacy")}</p>
          <Link href="/sign-in" className="hover:text-ink">
            {t("nav.signIn")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
