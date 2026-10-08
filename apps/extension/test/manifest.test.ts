import { createHash, generateKeyPairSync } from "node:crypto";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderIcon } from "../scripts/icons.ts";
import { extensionIdFromPublicKey, publicKeyFromPrivatePem } from "../scripts/keys.ts";
import { appOrigin, buildManifest, chromeVersion } from "../scripts/manifest.ts";

describe("buildManifest", () => {
  it("requests exactly the minimal permissions and only the app host", () => {
    const m = buildManifest({ appUrl: "http://localhost:3000", version: "0.1.0" });
    expect(m.permissions).toEqual(["activeTab", "scripting", "sidePanel", "storage"]);
    expect(m.host_permissions).toEqual(["http://localhost:3000/*"]);
    expect(m.externally_connectable).toEqual({ matches: ["http://localhost:3000/*"] });
    expect(m).not.toHaveProperty("optional_permissions");
    expect(m).not.toHaveProperty("optional_host_permissions");
    expect(m).not.toHaveProperty("content_scripts");
    expect(m).not.toHaveProperty("web_accessible_resources");
    expect(m).not.toHaveProperty("key");
    expect(m.manifest_version).toBe(3);
    expect(m.minimum_chrome_version).toBe("116");
    expect(m.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(m.side_panel).toEqual({ default_path: "sidepanel.html" });
  });

  it("normalizes the app URL to its origin", () => {
    const m = buildManifest({ appUrl: "https://app.elevate.example/some/path?x=1", version: "1.0.0" });
    expect(m.host_permissions).toEqual(["https://app.elevate.example/*"]);
    expect(m.externally_connectable).toEqual({ matches: ["https://app.elevate.example/*"] });
  });

  it("sets key only when a public key is provided", () => {
    expect(buildManifest({ appUrl: "http://localhost:3000", version: "0.1.0", publicKey: "MIIB" }).key).toBe("MIIB");
  });

  it("rejects non-https remote origins and invalid URLs", () => {
    expect(() => appOrigin("http://elevate.example")).toThrow(/https/);
    expect(() => appOrigin("ftp://elevate.example")).toThrow();
    expect(() => appOrigin("nope")).toThrow();
    expect(appOrigin("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
  });

  it("produces a Chrome-compatible version", () => {
    expect(chromeVersion("0.1.0")).toBe("0.1.0");
    expect(chromeVersion("1.2.3-beta.1")).toBe("1.2.3");
  });
});

describe("extension ID", () => {
  it("is sha256(DER SPKI) first 32 hex chars mapped 0-f → a-p", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const pub = publicKeyFromPrivatePem(pem);
    const id = extensionIdFromPublicKey(pub);
    expect(id).toMatch(/^[a-p]{32}$/);
    const hex = createHash("sha256").update(Buffer.from(pub, "base64")).digest("hex").slice(0, 32);
    expect(id).toBe(hex.replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)]!));
  });
});

describe("icons", () => {
  it.each([16, 32, 48, 128])("renders a valid %ipx RGBA PNG", (size) => {
    const png = Buffer.from(renderIcon(size));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    const idatLen = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString("ascii")).toBe("IDAT");
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(raw.length).toBe((size * 4 + 1) * size);
  });
});
