"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, Notice } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

type ChromeRuntime = { runtime?: { sendMessage?: (id: string, msg: unknown, cb: (res: unknown) => void) => void; lastError?: { message?: string } } };

function send(id: string, msg: unknown): Promise<{ ok?: boolean; error?: string } | undefined> {
  const chrome = (globalThis as unknown as { chrome?: ChromeRuntime }).chrome;
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) return resolve(undefined);
    const timer = setTimeout(() => resolve(undefined), 4000);
    try {
      chrome.runtime.sendMessage(id, msg, (res) => {
        clearTimeout(timer);
        resolve(chrome.runtime?.lastError ? undefined : (res as { ok?: boolean }));
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

/** Hands the user's own session to the installed extension. No server secret is shared. */
export function ConnectExtension({ extensionIds }: { extensionIds: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "missing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function connect() {
    setState("busy");
    setMessage(null);
    // Find the installed extension first, so we don't mint a session nobody receives.
    let target: string | null = null;
    for (const id of extensionIds) {
      const ping = await send(id, { type: "elevate:ping" });
      if (ping?.ok) {
        target = id;
        break;
      }
    }
    if (!target) return setState("missing");
    // The extension gets its own session; the website's session is never shared.
    let session: { accessToken: string; refreshToken: string; expiresAt: number | null; email: string | null };
    try {
      session = await api("/api/v1/auth/extension-session", { method: "POST", timeoutMs: 20_000 });
    } catch (e) {
      setMessage(errorMessage(e));
      return setState("error");
    }
    const res = await send(target, { type: "elevate:session", ...session });
    setState(res?.ok ? "done" : "missing");
  }

  if (extensionIds.length === 0) return <Notice tone="caution">{t("extensionConnect.notConfigured")}</Notice>;
  if (state === "done") return <Notice tone="accent">{t("extensionConnect.connected")}</Notice>;
  return (
    <div className="flex flex-col items-start gap-4">
      <Button size="lg" busy={state === "busy"} onClick={connect}>
        {state === "busy" ? t("extensionConnect.connecting") : t("extensionConnect.connect")}
      </Button>
      {state === "missing" ? <ErrorState message={t("extensionConnect.notInstalled")} /> : null}
      {state === "error" ? <ErrorState message={message ?? t("errors.unauthorized")} /> : null}
    </div>
  );
}
