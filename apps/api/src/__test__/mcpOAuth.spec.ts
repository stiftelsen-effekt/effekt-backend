import { expect } from "chai";
import { isAllowedRedirectUri, pkceS256, verifyPkceS256 } from "../custom_modules/mcp/oauthCrypto";

describe("MCP OAuth helpers", function () {
  it("allows Claude hosted and loopback redirect URIs", function () {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).to.equal(true);
    expect(isAllowedRedirectUri("https://claude.ai/ccr-token-vault-oauth-done")).to.equal(true);
    expect(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback")).to.equal(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:3118/callback")).to.equal(true);
  });

  it("rejects non-Claude redirect URIs", function () {
    expect(isAllowedRedirectUri("https://evil.example/callback")).to.equal(false);
    expect(isAllowedRedirectUri("https://claude.ai.evil.example/callback")).to.equal(false);
    expect(isAllowedRedirectUri("http://claude.ai/callback")).to.equal(false);
  });

  it("verifies PKCE S256", function () {
    const verifier = "abcdefghijklmnopqrstuvwxyz0123456789abcdef";
    const challenge = pkceS256(verifier);
    expect(verifyPkceS256(verifier, challenge)).to.equal(true);
    expect(verifyPkceS256("wrong-verifier-wrong-verifier-wrong", challenge)).to.equal(false);
  });
});
