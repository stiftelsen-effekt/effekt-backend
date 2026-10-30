import { describe, expect, it } from "vitest";
import { authUserFromClaims } from "@/auth/context";
import { config } from "@/lib/config";
import { userIdentity } from "./user-identity";

const signedIn = (claims: Parameters<typeof authUserFromClaims>[0]) => ({
  isAuthenticated: true,
  isLoading: false,
  user: authUserFromClaims(claims),
});

describe("userIdentity", () => {
  it("shows the name and email of a signed-in user with a full profile", () => {
    expect(
      userIdentity(
        signedIn({ sub: "google-oauth2|1", name: "Kari Nordmann", email: "kari@gieffektivt.no" }),
      ),
    ).toEqual({ label: "Kari Nordmann", detail: "kari@gieffektivt.no", initials: "KN" });
  });

  it("shows the email once when Auth0 set name = email", () => {
    expect(
      userIdentity(
        signedIn({ sub: "auth0|1", name: "ola@gieffektivt.no", email: "ola@gieffektivt.no" }),
      ),
    ).toEqual({ label: "ola@gieffektivt.no", detail: undefined, initials: "O" });
  });

  it("never says signed out for a signed-in user whose token has only sub", () => {
    const identity = userIdentity(signedIn({ sub: "auth0|1" }));
    expect(identity.label).toBe("Signed in");
    expect(identity.label).not.toMatch(/signed out/i);
    expect(identity.initials).toBe("");
  });

  it("says so while the session is loading", () => {
    expect(userIdentity({ isAuthenticated: false, isLoading: true, user: null }).label).toBe(
      "Signing in…",
    );
  });

  it("says signed out when not authenticated", () => {
    expect(userIdentity({ isAuthenticated: false, isLoading: false, user: null })).toEqual({
      label: "Signed out",
      initials: "",
    });
  });
});

describe("auth scope", () => {
  // An explicit `scope: undefined` overrides auth0-spa-js's default and asks for "openid" only.
  it("always asks Auth0 for the profile and email claims", () => {
    expect(config.auth.scope).toMatch(/\bprofile\b/);
    expect(config.auth.scope).toMatch(/\bemail\b/);
  });
});
