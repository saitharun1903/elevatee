import "server-only";
import { AwsClient } from "aws4fetch";
import { ElevateError, TIMEOUTS, withTimeout } from "@elevate/core/server";

/**
 * Private resume storage on Cloudflare R2 (S3 API). Credentials stay on the server;
 * the browser only ever receives short-lived signed GET URLs.
 */

const REQUIRED = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

export const storageConfigured = () => REQUIRED.every((k) => !!process.env[k]);
export const storageRequiredEnv = [...REQUIRED];

function client() {
  if (!storageConfigured()) return null;
  const aws = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  const base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
  return { aws, base };
}

const objectUrl = (base: string, key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<boolean> {
  const c = client();
  if (!c) return false;
  await withTimeout("File storage", TIMEOUTS.storage, async (signal) => {
    const res = await c.aws.fetch(objectUrl(c.base, key), {
      method: "PUT",
      body: body as BodyInit,
      headers: { "content-type": contentType, "content-length": String(body.byteLength) },
      signal,
    });
    if (!res.ok) throw new ElevateError("provider_error", `File storage rejected the upload (${res.status}).`);
  });
  return true;
}

export async function deleteObject(key: string): Promise<void> {
  const c = client();
  if (!c) return;
  await withTimeout("File storage", TIMEOUTS.storage, async (signal) => {
    const res = await c.aws.fetch(objectUrl(c.base, key), { method: "DELETE", signal });
    if (!res.ok && res.status !== 404) throw new ElevateError("provider_error", `File storage delete failed (${res.status}).`);
  });
}

/** Signed URL valid for `seconds` (default 5 minutes). */
export async function signedGetUrl(key: string, fileName: string, seconds = 300): Promise<string | null> {
  const c = client();
  if (!c) return null;
  const url = new URL(objectUrl(c.base, key));
  url.searchParams.set("X-Amz-Expires", String(seconds));
  url.searchParams.set("response-content-disposition", `attachment; filename="${fileName.replace(/[^\w.\- ]/g, "_")}"`);
  const signed = await c.aws.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/** Real health check: lists at most one object in the bucket. */
export async function checkStorage(): Promise<{ ok: boolean; detail: string }> {
  const c = client();
  if (!c) return { ok: false, detail: "Not configured" };
  try {
    const res = await withTimeout("File storage", TIMEOUTS.storage, (signal) => c.aws.fetch(`${c.base}?list-type=2&max-keys=1`, { signal }));
    return res.ok ? { ok: true, detail: "Bucket reachable" } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Unreachable" };
  }
}
