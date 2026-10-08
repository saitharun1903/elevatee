/**
 * Package build/ into a store-uploadable zip (dependency-free ZIP writer, deflate via node:zlib).
 * Refuses to package a build that contains a manifest "key" (a development pin) and skips
 * sourcemaps.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "./icons.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(root, "build");
const manifest = JSON.parse(readFileSync(path.join(buildDir, "manifest.json"), "utf8")) as { version: string; key?: string };
if (manifest.key) {
  throw new Error('build/manifest.json contains a development "key". Rebuild without EXTENSION_PUBLIC_KEY before zipping for a store.');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(buildDir)
  .filter((f) => !f.endsWith(".map"))
  .sort();
const locals: Buffer[] = [];
const centrals: Buffer[] = [];
let offset = 0;
// Fixed DOS timestamp (1980-01-01 00:00) for reproducible archives.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

for (const file of files) {
  const name = Buffer.from(path.relative(buildDir, file).split(path.sep).join("/"), "utf8");
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, comp);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + comp.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const distDir = path.join(root, "dist");
mkdirSync(distDir, { recursive: true });
const zipPath = path.join(distDir, `elevate-extension-${manifest.version}.zip`);
writeFileSync(zipPath, Buffer.concat([...locals, ...centrals, end]));
console.log(`Wrote ${zipPath} (${files.length} files)`);
