/** Extension ID ↔ public key helpers (Chrome's algorithm). */
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

/** sha256(DER SubjectPublicKeyInfo) → first 32 hex chars → map 0-f to a-p. */
export function extensionIdFromPublicKey(derBase64: string): string {
  const hex = createHash("sha256").update(Buffer.from(derBase64, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

/** Base64 DER SPKI of the public half of a PEM private key (the manifest "key" value). */
export function publicKeyFromPrivatePem(pem: string): string {
  const pub = createPublicKey(createPrivateKey(pem));
  return (pub.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
}
