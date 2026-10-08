import { getT } from "@/lib/i18n";

const t = getT();
export const dynamic = "force-static";

export default function Offline() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <p className="eyebrow">{t("brand.name")}</p>
      <h1 className="font-display text-h1">{t("common.offline")}</h1>
    </main>
  );
}
