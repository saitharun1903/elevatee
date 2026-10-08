/**
 * Build the extension into build/.
 *   node scripts/build.ts            production (minified, no sourcemaps, no "key" unless EXTENSION_PUBLIC_KEY)
 *   node scripts/build.ts --dev      development (sourcemaps; pins the ID from .dev-key.pem if present)
 *   node scripts/build.ts --watch    rebuild on change (implies --dev)
 *
 * Env: ELEVATE_APP_URL (default http://localhost:3000), EXTENSION_PUBLIC_KEY, ELEVATE_SENTRY_DSN.
 */
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appOrigin, buildManifest } from "./manifest.ts";
import { renderIcon } from "./icons.ts";
import { extensionIdFromPublicKey, publicKeyFromPrivatePem } from "./keys.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "build");
const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const dev = watch || args.has("--dev");

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string };
const appUrl = appOrigin(process.env.ELEVATE_APP_URL?.trim() || "http://localhost:3000");
const sentryDsn = process.env.ELEVATE_SENTRY_DSN?.trim() || "";

let publicKey = process.env.EXTENSION_PUBLIC_KEY?.trim() || null;
const devKeyPath = path.join(root, ".dev-key.pem");
if (!publicKey && dev && existsSync(devKeyPath)) publicKey = publicKeyFromPrivatePem(readFileSync(devKeyPath, "utf8"));

function writeStatic(): void {
  mkdirSync(out, { recursive: true });
  const manifest = buildManifest({ appUrl, version: pkg.version, publicKey });
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  cpSync(path.join(root, "src/sidepanel/sidepanel.html"), path.join(out, "sidepanel.html"));
  cpSync(path.join(root, "static/_locales"), path.join(out, "_locales"), { recursive: true });
  mkdirSync(path.join(out, "icons"), { recursive: true });
  for (const size of [16, 32, 48, 128]) writeFileSync(path.join(out, "icons", `icon-${size}.png`), renderIcon(size));
  // Font licenses (SIL OFL) travel with the bundled font files.
  const require = createRequire(path.join(root, "package.json"));
  mkdirSync(path.join(out, "fonts"), { recursive: true });
  for (const f of ["schibsted-grotesk", "newsreader", "ibm-plex-mono"]) {
    const dir = path.dirname(require.resolve(`@fontsource/${f}/package.json`));
    const lic = path.join(dir, "LICENSE");
    if (existsSync(lic)) cpSync(lic, path.join(out, "fonts", `LICENSE-${f}.txt`));
  }
}

const options: esbuild.BuildOptions = {
  absWorkingDir: root,
  entryPoints: [
    { in: "src/background.ts", out: "background" },
    { in: "src/sidepanel/main.ts", out: "sidepanel" },
    { in: "src/sidepanel/sidepanel.css", out: "sidepanel" },
  ],
  outdir: out,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome116", "edge116"],
  minify: !dev,
  sourcemap: dev ? "linked" : false,
  legalComments: dev ? "inline" : "none",
  charset: "utf8",
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "fonts/[name]-[hash]",
  define: {
    __ELEVATE_APP_URL__: JSON.stringify(appUrl),
    __ELEVATE_VERSION__: JSON.stringify(pkg.version),
    __ELEVATE_SENTRY_DSN__: JSON.stringify(sentryDsn),
  },
  logLevel: "warning",
};

rmSync(out, { recursive: true, force: true });
writeStatic();

const summary = [
  `Elevate extension ${pkg.version} (${dev ? "development" : "production"}) -> ${out}`,
  `  APP_URL      ${appUrl}`,
  `  Sentry       ${sentryDsn ? "enabled" : "disabled"}`,
  `  Manifest key ${publicKey ? `pinned, extension ID ${extensionIdFromPublicKey(publicKey)}` : "none (ID assigned by the browser/store)"}`,
].join("\n");

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`${summary}\nWatching for changes. Reload the extension in chrome://extensions after edits.`);
} else {
  await esbuild.build(options);
  console.log(summary);
}
