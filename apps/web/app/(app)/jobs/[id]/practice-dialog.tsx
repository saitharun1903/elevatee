"use client";

import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { InterviewMode } from "@elevate/core";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

/** Choose an interview type and start a mock interview grounded in this job. */
export function PracticeDialog({ open, onClose, jobId, isTechnical }: { open: boolean; onClose: () => void; jobId: string; isTechnical: boolean | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [mode, setMode] = useState<InterviewMode>(isTechnical ? "technical" : "mixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string }>(`/api/v1/jobs/${jobId}/mock-interview`, { method: "POST", json: { mode }, timeoutMs: 60_000 });
      router.push(`/interviews/${res.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-raised p-6 text-ink shadow-3 backdrop:bg-ink/30">
      <h2 className="font-display text-h2">{t("interviews.start")}</h2>
      <fieldset className="mt-5">
        <legend className="mb-3 text-small font-medium">{t("interviews.mode")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {InterviewMode.options.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={clsx("rounded-sm border px-3 py-2.5 text-left text-small", mode === m ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink-3")}>
              {t(`interviews.modes.${m}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {error ? <div className="mt-4"><ErrorState message={error} /></div> : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button busy={busy} onClick={start}>
          {busy ? t("interviews.starting") : t("interviews.start")}
        </Button>
      </div>
    </dialog>
  );
}
