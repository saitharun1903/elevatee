"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n";

const t = getT();

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Reported to Sentry by the client SDK when configured; only the digest is logged here.
    console.error("render_error", error.digest ?? "");
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="font-display text-h1">{t("common.errorGeneric")}</h1>
      {error.digest ? <p className="font-mono text-meta text-ink-3">{error.digest}</p> : null}
      <div>
        <Button onClick={reset}>{t("common.retry")}</Button>
      </div>
    </main>
  );
}
