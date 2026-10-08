"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, Notice } from "@/components/ui/states";
import { browserSupabase } from "@/lib/client/supabase";
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

  async function connect() {
    setState("busy");
    const sb = browserSupabase();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const session = data.session;
    if (!session) return setState("error");
    for (const id of extensionIds) {
      const ping = await send(id, { type: "elevate:ping" });
      if (!ping?.ok) continue;
      const res = await send(id, {
        type: "elevate:session",
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? null,
        email: session.user.email ?? null,
      });
      if (res?.ok) return setState("done");
    }
    setState("missing");
  }

  if (extensionIds.length === 0) return <Notice tone="caution">{t("extensionConnect.notConfigured")}</Notice>;
  if (state === "done") return <Notice tone="accent">{t("extensionConnect.connected")}</Notice>;
  return (
    <div className="flex flex-col items-start gap-4">
      <Button size="lg" busy={state === "busy"} onClick={connect}>
        {state === "busy" ? t("extensionConnect.connecting") : t("extensionConnect.connect")}
      </Button>
      {state === "missing" ? <ErrorState message={t("extensionConnect.notInstalled")} /> : null}
      {state === "error" ? <ErrorState message={t("errors.unauthorized")} /> : null}
    </div>
  );
}
