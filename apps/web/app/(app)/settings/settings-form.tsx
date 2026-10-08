"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { ErrorState, Notice } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/client/api";
import { getT } from "@/lib/i18n";

const t = getT();

interface Values {
  display_name: string;
  locale: string;
  country: string;
  currency: string;
  timezone: string;
  theme: "system" | "light" | "dark";
  product_analytics: boolean;
}

const supported = (key: "region" | "currency" | "timeZone"): string[] => {
  try {
    if (key === "timeZone") return Intl.supportedValuesOf("timeZone");
    if (key === "currency") return Intl.supportedValuesOf("currency");
  } catch {
    /* older engines */
  }
  return [];
};

// ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames in the user's language.
const REGIONS = "AE AR AT AU BD BE BG BH BR CA CH CL CN CO CZ DE DK EG ES ET FI FR GB GH GR HK HU ID IE IL IN IT JP KE KR KW LK MA MX MY NG NL NO NP NZ OM PE PH PK PL PT QA RO RU SA SE SG TH TR TW TZ UA UG US VN ZA".split(" ");
const LOCALES = ["en", "en-IN", "en-US", "en-GB", "en-CA", "en-AU", "fr", "de", "es", "pt-BR", "ar", "hi", "te", "ja", "zh-CN"];

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezones = useMemo(() => supported("timeZone"), []);
  const currencies = useMemo(() => supported("currency"), []);
  const regionName = (c: string) => {
    try {
      return new Intl.DisplayNames([v.locale || "en"], { type: "region" }).of(c) ?? c;
    } catch {
      return c;
    }
  };
  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setSaved(false);
    setV((x) => ({ ...x, [k]: val }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/me", {
        method: "PATCH",
        json: {
          profile: {
            display_name: v.display_name || null,
            locale: v.locale || null,
            country: v.country || null,
            currency: v.currency || null,
            timezone: v.timezone || null,
          },
          preferences: { theme: v.theme, product_analytics: v.product_analytics },
        },
      });
      try {
        if (v.theme === "system") {
          localStorage.removeItem("elevate-theme");
          delete document.documentElement.dataset.theme;
        } else {
          localStorage.setItem("elevate-theme", v.theme);
          document.documentElement.dataset.theme = v.theme;
        }
      } catch {
        /* storage blocked: preference still saved server-side */
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const detectedTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <form onSubmit={save} className="flex flex-col gap-10">
      <section className="flex flex-col gap-5 border-t border-ink pt-4">
        <div>
          <h2 className="text-h3 font-medium">{t("settings.region")}</h2>
          <p className="mt-1 text-small text-ink-2">{t("settings.regionLede")}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("settings.displayName")}>{(p) => <Input {...p} value={v.display_name} maxLength={120} onChange={(e) => set("display_name", e.target.value)} />}</Field>
          <Field label={t("settings.locale")}>
            {(p) => (
              <Select {...p} value={v.locale} onChange={(e) => set("locale", e.target.value)}>
                <option value="">{t("settings.notSet")}</option>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("settings.country")}>
            {(p) => (
              <Select {...p} value={v.country} onChange={(e) => set("country", e.target.value)}>
                <option value="">{t("settings.notSet")}</option>
                {REGIONS.map((c) => ({ c, n: regionName(c) }))
                  .sort((a, b) => a.n.localeCompare(b.n))
                  .map(({ c, n }) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label={t("settings.currency")}>
            {(p) => (
              <Select {...p} value={v.currency} onChange={(e) => set("currency", e.target.value)}>
                <option value="">{t("settings.notSet")}</option>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("settings.timezone")} help={!v.timezone && detectedTz ? t("settings.detected", { tz: detectedTz }) : undefined}>
            {(p) => (
              <Select {...p} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
                <option value="">{t("settings.notSet")}</option>
                {timezones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("settings.theme")}>
            {(p) => (
              <Select {...p} value={v.theme} onChange={(e) => set("theme", e.target.value as Values["theme"])}>
                <option value="system">{t("settings.themeSystem")}</option>
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
              </Select>
            )}
          </Field>
        </div>
        <label className="flex items-start gap-3 text-small">
          <input type="checkbox" checked={v.product_analytics} onChange={(e) => set("product_analytics", e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--ink)]" />
          <span>
            <span className="font-medium">{t("settings.analytics")}</span>
            <span className="block text-ink-3">{t("settings.analyticsHelp")}</span>
          </span>
        </label>
      </section>
      {error ? <ErrorState message={error} /> : null}
      {saved ? <Notice tone="accent">{t("settings.saved")}</Notice> : null}
      <div>
        <Button type="submit" busy={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
