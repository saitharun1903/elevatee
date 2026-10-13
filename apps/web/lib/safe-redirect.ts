/**
 * Returns a same-site path for post-sign-in redirects, or the fallback.
 * Rejects anything a browser could resolve to another origin: protocol-relative paths,
 * backslashes (browsers treat "\" as "/"), control characters (tabs/newlines are stripped
 * by URL parsers) and encoded variants of those.
 */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  if (!next || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (next.includes("\\") || /[\u0000-\u001f\u007f]|%5c|%2f%2f|%0[0-9a-d]/i.test(next)) return fallback;
  try {
    const base = "https://elevate.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
