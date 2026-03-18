import { describe, expect, it } from "vitest";
import { resolveTrustedReleaseUrl } from "./externalUrl";

describe("resolveTrustedReleaseUrl", () => {
  it("allows trusted GitHub release URLs", () => {
    expect(resolveTrustedReleaseUrl("https://github.com/GlxV/fluxshare/releases/tag/v2.1.0")).toBe(
      "https://github.com/GlxV/fluxshare/releases/tag/v2.1.0",
    );
  });

  it("blocks untrusted schemes and hosts", () => {
    expect(resolveTrustedReleaseUrl("javascript:alert(1)")).toBeNull();
    expect(resolveTrustedReleaseUrl("file:///C:/Windows/System32/calc.exe")).toBeNull();
    expect(resolveTrustedReleaseUrl("https://evil.example/releases/tag/v9.9.9")).toBeNull();
  });
});
