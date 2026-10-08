/**
 * Create (once) a local development signing key so the unpacked extension has a stable ID.
 * The PRIVATE key stays in apps/extension/.dev-key.pem (gitignored). Prints the public key
 * (for EXTENSION_PUBLIC_KEY) and the resulting extension ID (for NEXT_PUBLIC_EXTENSION_IDS).
 */
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extensionIdFromPublicKey, publicKeyFromPrivatePem } from "./keys.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".dev-key.pem");
if (!existsSync(file)) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
  console.log(`Created ${file} (private: never commit or share it).`);
}
const pub = publicKeyFromPrivatePem(readFileSync(file, "utf8"));
const id = extensionIdFromPublicKey(pub);
console.log(`EXTENSION_PUBLIC_KEY=${pub}`);
console.log(`Extension ID: ${id}`);
console.log(`Web app env:  NEXT_PUBLIC_EXTENSION_IDS=${id}`);
