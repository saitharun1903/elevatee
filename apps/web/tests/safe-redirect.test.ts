import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/jobs/abc?tab=match")).toBe("/jobs/abc?tab=match");
    expect(safeNext("/analyze")).toBe("/analyze");
  });
  it("rejects every off-site form", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/%5Cevil.com", "/\tevil.com", "/%09/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/\\/evil.com", "", null, undefined]) {
      expect(safeNext(bad as string)).toBe("/home");
    }
  });
});
