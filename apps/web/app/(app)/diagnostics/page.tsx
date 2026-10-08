import type { Metadata } from "next";
import { getT } from "@/lib/i18n";
import { canViewDiagnostics, configurationState } from "@/lib/server/diagnostics";
import { getViewer } from "@/lib/server/viewer";
import { DiagnosticsPanel } from "./panel";

const t = getT();
export const metadata: Metadata = { title: t("diagnostics.title"), robots: { index: false } };

export default async function DiagnosticsPage() {
  const viewer = await getViewer();
  if (!canViewDiagnostics(viewer.email)) {
    return <p className="text-ink-2">{t("diagnostics.restricted")}</p>;
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="font-display text-h1">{t("diagnostics.title")}</h1>
        <p className="mt-2 text-ink-2">{t("diagnostics.lede")}</p>
      </header>
      <DiagnosticsPanel initial={configurationState()} />
    </div>
  );
}
