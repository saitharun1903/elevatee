import { describe, expect, it } from "vitest";
import { lookup } from "node:dns/promises";
import { fetchThroughPinnedAgent } from "../src/net/safe-fetch";

const resolves = async (host: string) => lookup(host).then(() => true, () => false);

describe("pinned connection lookup (DNS rebinding defence)", () => {
  it("refuses to connect when a public hostname resolves to a private address", async () => {
    // localtest.me is a public DNS name that resolves to 127.0.0.1.
    if (!(await resolves("localtest.me"))) return;
    expect(await fetchThroughPinnedAgent("http://localtest.me/")).toBe("blocked");
  }, 15_000);
  it("still connects to public hosts", async () => {
    if (!(await resolves("example.com"))) return;
    expect(await fetchThroughPinnedAgent("https://example.com/")).toBe("ok");
  }, 15_000);
});
