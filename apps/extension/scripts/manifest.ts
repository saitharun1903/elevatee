/**
 * Manifest generation. The permission set is deliberately minimal and fixed here; the only
 * environment-dependent parts are the Elevate app origin and the optional dev "key".
 */

export const PERMISSIONS = ["activeTab", "scripting", "sidePanel", "storage"] as const;

export interface ManifestOptions {
  appUrl: string;
  version: string;
  /** Base64 DER SubjectPublicKeyInfo. Pins the extension ID for local development only. */
  publicKey?: string | null;
}

/** "http://localhost:3000/anything" → "http://localhost:3000". Rejects non-http(s) URLs. */
export function appOrigin(appUrl: string): string {
  let u: URL;
  try {
    u = new URL(appUrl);
  } catch {
    throw new Error(`ELEVATE_APP_URL is not a valid URL: ${appUrl}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`ELEVATE_APP_URL must be http(s): ${appUrl}`);
  if (u.protocol === "http:" && !["localhost", "127.0.0.1"].includes(u.hostname)) {
    throw new Error(`ELEVATE_APP_URL must use https unless it is localhost: ${appUrl}`);
  }
  return u.origin;
}

/** Chrome versions are 1-4 dot-separated integers; strip any prerelease suffix. */
export function chromeVersion(v: string): string {
  const core = v.split(/[-+]/)[0] ?? "0.0.0";
  const parts = core.split(".").filter((p) => /^\d+$/.test(p)).slice(0, 4);
  return parts.length ? parts.join(".") : "0.0.0";
}

export function buildManifest(opts: ManifestOptions): Record<string, unknown> {
  const origin = appOrigin(opts.appUrl);
  const icons = { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" };
  const manifest: Record<string, unknown> = {
    manifest_version: 3,
    name: "__MSG_appName__",
    short_name: "Elevate",
    description: "__MSG_appDescription__",
    default_locale: "en",
    version: chromeVersion(opts.version),
    version_name: opts.version,
    minimum_chrome_version: "116",
    icons,
    action: { default_title: "__MSG_actionTitle__", default_icon: icons },
    background: { service_worker: "background.js", type: "module" },
    side_panel: { default_path: "sidepanel.html" },
    permissions: [...PERMISSIONS],
    host_permissions: [`${origin}/*`],
    externally_connectable: { matches: [`${origin}/*`] },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
  if (opts.publicKey) manifest.key = opts.publicKey;
  return manifest;
}
