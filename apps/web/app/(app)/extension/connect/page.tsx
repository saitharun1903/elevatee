import type { Metadata } from "next";
import { getT } from "@/lib/i18n";
import { publicEnv } from "@/lib/env";
import { ConnectExtension } from "./connect";

const t = getT();
export const metadata: Metadata = { title: t("extensionConnect.title") };

export default function ConnectPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-display text-h1">{t("extensionConnect.title")}</h1>
      <p className="text-ink-2">{t("extensionConnect.lede")}</p>
      <ConnectExtension extensionIds={publicEnv.extensionIds} />
    </div>
  );
}
