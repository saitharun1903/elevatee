"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { browserSupabase } from "@/lib/client/supabase";
import { getT } from "@/lib/i18n";

const t = getT();

export function SignInForm({ next, google, callbackError }: { next: string; google: boolean; callbackError: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const sb = browserSupabase();
    if (!sb) return setState("error");
    setState("sending");
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
    setState(error ? "error" : "sent");
  }

  async function withGoogle() {
    const sb = browserSupabase();
    if (!sb) return setState("error");
    await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  }

  if (state === "sent") {
    return (
      <Notice tone="accent">
        <p className="text-body text-ink">{t("auth.sent")}</p>
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {callbackError ? <Notice tone="signal">{t("auth.callbackError")}</Notice> : null}
      <form onSubmit={sendLink} className="flex flex-col gap-4">
        <Field label={t("auth.email")} error={state === "error" ? t("auth.error") : null}>
          {(p) => <Input {...p} type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" busy={state === "sending"}>
          {state === "sending" ? t("auth.sending") : t("auth.sendLink")}
        </Button>
      </form>
      {google ? (
        <>
          <div className="flex items-center gap-3 text-meta text-ink-4">
            <span className="h-px flex-1 bg-line" />
            {t("auth.or")}
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" size="lg" onClick={withGoogle}>
            {t("auth.google")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
