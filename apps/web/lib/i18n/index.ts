import { en } from "./en";

/**
 * Minimal, dependency-free localisation layer. Every UI string lives in a dictionary keyed by
 * dotted path. Only English ships today; adding a language means adding a dictionary with the
 * same shape and registering it below.
 */

export type Dictionary = typeof en;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Dictionary>;

const dictionaries: Record<string, Dictionary> = { en };

export const SUPPORTED_UI_LOCALES = Object.keys(dictionaries);

export function resolveUiLocale(locale: string | null | undefined): string {
  if (!locale) return "en";
  const base = locale.split("-")[0]!.toLowerCase();
  return dictionaries[base] ? base : "en";
}

export function translate(dict: Dictionary, key: MessageKey, vars?: Record<string, string | number>): string {
  let node: unknown = dict;
  for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part];
  let str = typeof node === "string" ? node : key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
  return str;
}

export function getT(locale?: string | null) {
  const dict = dictionaries[resolveUiLocale(locale)] ?? en;
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(dict, key, vars);
}

export type T = ReturnType<typeof getT>;
