import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "./mode";

describe("resolveAuthMode", () => {
  it("production builds refuse dev and preview auth", () => {
    expect(() =>
      resolveAuthMode({ requested: "dev", production: true, buildMode: "production" }),
    ).toThrow(/not allowed in production/);
    expect(() =>
      resolveAuthMode({ requested: "preview", production: true, buildMode: "production" }),
    ).toThrow(/only allowed in preview builds/);
    expect(resolveAuthMode({ requested: "auth0", production: true, buildMode: "production" })).toBe(
      "auth0",
    );
  });

  it("preview builds allow preview auth, never dev auth", () => {
    expect(resolveAuthMode({ requested: "preview", production: true, buildMode: "preview" })).toBe(
      "preview",
    );
    expect(() =>
      resolveAuthMode({ requested: "dev", production: true, buildMode: "preview" }),
    ).toThrow();
  });

  it("local development allows every mode", () => {
    for (const requested of ["auth0", "dev", "preview"] as const) {
      expect(resolveAuthMode({ requested, production: false, buildMode: "development" })).toBe(
        requested,
      );
    }
  });
});
