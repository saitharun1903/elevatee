"use client";

import { clsx } from "clsx";
import { useState } from "react";
import type { Check } from "@/lib/server/diagnostics";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

const LABEL: Record<Check["state"], string> = {
  verified: t("diagnostics.ok"),
  failed: t("diagnostics.fail"),
  unconfigured: t("diagnostics.unconfigured"),
  configured: t("diagnostics.configuredUnverified"),
};

export function DiagnosticsPanel({ initial }: { initial: Check[] }) {
  const [checks, setChecks] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ checks: Check[]; checkedAt: string }>("/api/v1/diagnostics", { method: "POST", timeoutMs: 60_000 });
      setChecks(res.checks);
      setAt(res.checkedAt);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button onClick={run} busy={busy}>
          {busy ? t("diagnostics.running") : t("diagnostics.run")}
        </Button>
        {at ? <span className="font-mono text-meta text-ink-3">{at}</span> : null}
      </div>
      {error ? <ErrorState message={error} /> : null}
      <table className="w-full border-collapse text-left text-small">
        <tbody>
          {checks.map((c) => (
            <tr key={c.key} className="border-b border-line align-top">
              <th scope="row" className="py-3 pr-4 font-medium capitalize">{c.key}</th>
              <td className="py-3 pr-4">
                <span className={clsx("font-mono text-meta", c.state === "verified" && "text-accent", c.state === "failed" && "text-signal", c.state === "configured" && "text-caution", c.state === "unconfigured" && "text-ink-3")}>{LABEL[c.state]}</span>
                {c.provider ? <span className="ml-2 text-ink-3">{c.provider}</span> : null}
                {c.detail ? <span className="block text-meta text-ink-3">{c.detail}{c.latencyMs !== null ? ` · ${c.latencyMs} ms` : ""}</span> : null}
              </td>
              <td className="py-3 text-meta text-ink-3">{c.state === "unconfigured" ? t("diagnostics.requiredEnv", { vars: c.requiredEnv.join(" or ") }) : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
