import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/lib/i18n";

const t = getT();

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-xl flex-col justify-center gap-6 px-4">
      <p className="eyebrow">404</p>
      <h1 className="font-display text-h1">{t("errors.notFound")}</h1>
      <div>
        <ButtonLink href="/home" variant="secondary">
          {t("errors.goHome")}
        </ButtonLink>
      </div>
    </main>
  );
}
