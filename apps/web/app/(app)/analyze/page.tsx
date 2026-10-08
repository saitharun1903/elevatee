import type { Metadata } from "next";
import { AnalyzeForm } from "./analyze-form";
import { getT } from "@/lib/i18n";

const t = getT();
export const metadata: Metadata = { title: t("analyze.title") };

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-h1">{t("analyze.title")}</h1>
      <p className="mt-3 text-ink-2">{t("analyze.lede")}</p>
      <div className="mt-10">
        <AnalyzeForm initialMode={mode === "text" ? "text" : "url"} />
      </div>
    </div>
  );
}
