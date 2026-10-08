import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { ElevateError } from "../util/errors";
import { TIMEOUTS, withTimeout } from "../util/timeout";

/**
 * SSRF-safe HTTP fetch for user-supplied URLs (job pages).
 * - only http/https on default ports
 * - resolves DNS and rejects private, loopback, link-local, multicast and reserved ranges
 * - follows redirects manually (max 5) and re-validates every hop
 * - caps body size and enforces a timeout
 * It does NOT try to bypass bot protection, logins or CAPTCHAs: such responses are reported as blocked.
 */

const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

export function assertPublicUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ElevateError("invalid_input", "That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ElevateError("blocked_url", "Only http and https links can be analyzed.");
  }
  if (url.username || url.password) {
    throw new ElevateError("blocked_url", "Links containing credentials can't be analyzed.");
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new ElevateError("blocked_url", "Links on non-standard ports can't be analyzed.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new ElevateError("blocked_url", "Local or internal addresses can't be analyzed.");
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  return parsed.range() === "unicast";
}

async function assertResolvesPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new ElevateError("blocked_url", "Private network addresses can't be analyzed.");
    return;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch (cause) {
    throw new ElevateError("fetch_failed", "We couldn't find that website. Check the link and try again.", { cause });
  }
  if (records.length === 0 || records.some((r) => !isPublicAddress(r.address))) {
    throw new ElevateError("blocked_url", "That link points to a private network address and can't be analyzed.");
  }
}

const BLOCK_MARKERS = [
  /captcha/i,
  /cf-chl|challenge-platform|just a moment\.\.\./i,
  /access denied/i,
  /are you a robot|verify you are human|unusual traffic/i,
  /please enable javascript and cookies/i,
  /authwall|sign in to view|join to view|login to continue/i,
];

/** Heuristic: does this response look like a bot wall or login wall instead of the job? */
export function looksBlocked(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status === 999) return true;
  const head = body.slice(0, 20_000);
  const hasJobData = /JobPosting/.test(body);
  return !hasJobData && BLOCK_MARKERS.some((re) => re.test(head)) && body.length < 200_000;
}

export async function safeFetchPage(rawUrl: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<SafeFetchResult> {
  let url = assertPublicUrlShape(rawUrl);
  return withTimeout(
    "The job page",
    opts.timeoutMs ?? TIMEOUTS.urlFetch,
    async (signal) => {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertResolvesPublic(url);
        const res = await fetch(url, {
          redirect: "manual",
          signal,
          headers: {
            // Identify honestly. We do not impersonate browsers to get around bot protection.
            "user-agent": "ElevateJobReader/1.0 (+https://github.com/elevate; fetches a single job page on user request)",
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            "accept-language": "en;q=0.9,*;q=0.5",
          },
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) throw new ElevateError("fetch_failed", "The job page redirected without a destination.");
          url = assertPublicUrlShape(new URL(loc, url).toString());
          continue;
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
          throw new ElevateError("fetch_failed", "That link doesn't point to a web page we can read.");
        }
        const body = await readCapped(res, MAX_BYTES);
        if (looksBlocked(res.status, body)) {
          throw new ElevateError(
            "page_blocked",
            "This site blocks automated reading or requires sign-in. Open the job in your browser and use the Elevate extension, or paste the job description.",
            { details: { status: res.status, host: url.hostname } },
          );
        }
        if (res.status >= 400) {
          throw new ElevateError("fetch_failed", `The job page returned an error (${res.status}). It may have been removed.`, {
            details: { status: res.status },
          });
        }
        return { finalUrl: url.toString(), status: res.status, contentType, body };
      }
      throw new ElevateError("fetch_failed", "The job page redirected too many times.");
    },
    opts.signal,
  );
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const c of chunks) {
    buf.set(c.subarray(0, Math.min(c.byteLength, buf.byteLength - offset)), offset);
    offset += c.byteLength;
    if (offset >= buf.byteLength) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}
