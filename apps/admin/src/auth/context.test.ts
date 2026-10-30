import { describe, expect, it } from "vitest";
import { givenNameFrom, isSessionEndedError } from "./context";

describe("givenNameFrom", () => {
  it("prefers given_name, else the first word of a real name", () => {
    expect(givenNameFrom({ given_name: "Kari", name: "Kari Nordmann" })).toBe("Kari");
    expect(givenNameFrom({ name: "Ola Nordmann" })).toBe("Ola");
  });

  it("never greets an email address or an id", () => {
    expect(givenNameFrom({ name: "ola@example.org" })).toBeUndefined();
    expect(givenNameFrom({ name: "auth0|12345" })).toBeUndefined();
    expect(givenNameFrom({})).toBeUndefined();
  });
});

describe("isSessionEndedError", () => {
  it("is true for Auth0 errors that need a new login", () => {
    expect(isSessionEndedError({ error: "login_required" })).toBe(true);
    expect(isSessionEndedError({ error: "missing_refresh_token" })).toBe(true);
  });

  it("is false for other failures", () => {
    expect(isSessionEndedError(new Error("Failed to fetch"))).toBe(false);
    expect(isSessionEndedError({ error: "timeout" })).toBe(false);
    expect(isSessionEndedError(null)).toBe(false);
  });
});
