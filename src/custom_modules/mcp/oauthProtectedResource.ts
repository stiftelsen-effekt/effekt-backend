import type { Response } from "express";
import config from "../../config";
import authorizationPermissions from "../../enums/authorizationPermissions";

/** Canonical MCP resource URL, including path, no trailing slash. */
export function getMcpResourceUrl(): string {
  const fromEnv = config.mcp_resource_url || process.env.MCP_RESOURCE_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  const api = String(config.api_url || "").replace(/\/$/, "");
  return api ? `${api}/mcp` : "https://data.gieffektivt.no/mcp";
}

/** Auth0 issuer, with trailing slash to match the token `iss` claim. */
export function getMcpAuthorizationServer(): string {
  const iss = String(config.authIssuerBaseURL || "https://gieffektivt.eu.auth0.com/");
  return iss.endsWith("/") ? iss : `${iss}/`;
}

export function getResourceMetadataUrl(): string {
  const resource = getMcpResourceUrl();
  try {
    const url = new URL(resource);
    return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
  } catch {
    return "https://data.gieffektivt.no/.well-known/oauth-protected-resource/mcp";
  }
}

/** RFC 9728 Protected Resource Metadata for the analysis MCP. */
export function getProtectedResourceMetadata() {
  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [getMcpAuthorizationServer()],
    bearer_methods_supported: ["header"],
    scopes_supported: [authorizationPermissions.analysis_mcp],
  };
}

/**
 * 401 + WWW-Authenticate so Claude can discover Auth0 instead of treating
 * data.gieffektivt.no as the authorization server.
 */
export function sendMcpAuthChallenge(res: Response, error = "invalid_token") {
  const metadataUrl = getResourceMetadataUrl();
  const scope = authorizationPermissions.analysis_mcp;
  res.setHeader(
    "WWW-Authenticate",
    `Bearer error="${error}", resource_metadata="${metadataUrl}", scope="${scope}"`,
  );
  return res.status(401).json({
    error,
    error_description: "Authentication required",
  });
}
