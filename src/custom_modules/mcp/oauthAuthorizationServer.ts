import type { Request, Response } from "express";
import config from "../../config";
import authorizationPermissions from "../../enums/authorizationPermissions";
import { getAuth0Issuer, getMcpIssuer, getMcpResourceUrl } from "./oauthProtectedResource";
import { isAllowedRedirectUri, open, seal, verifyPkceS256 } from "./oauthCrypto";

const STATE_TTL_SEC = 10 * 60;
const CODE_TTL_SEC = 90;

export function getAuthorizationServerMetadata() {
  const issuer = getMcpIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [authorizationPermissions.analysis_mcp, "offline_access"],
  };
}

function oauthError(res: Response, status: number, error: string, description?: string) {
  return res.status(status).json({ error, error_description: description });
}

export function handleRegister(req: Request, res: Response) {
  const redirectUris = req.body?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError(res, 400, "invalid_client_metadata", "redirect_uris is required");
  }
  if (!redirectUris.every((uri) => typeof uri === "string" && isAllowedRedirectUri(uri))) {
    return oauthError(res, 400, "invalid_redirect_uri");
  }
  try {
    const clientId = seal({ redirect_uris: redirectUris }, 30 * 24 * 60 * 60);
    return res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  } catch (ex: any) {
    console.error("MCP OAuth register error:", ex);
    return oauthError(res, 503, "temporarily_unavailable", "OAuth proxy is not configured");
  }
}

export function handleAuthorize(req: Request, res: Response) {
  const responseType = String(req.query.response_type || "");
  const clientId = String(req.query.client_id || "");
  const redirectUri = String(req.query.redirect_uri || "");
  const state = String(req.query.state || "");
  const codeChallenge = String(req.query.code_challenge || "");
  const codeChallengeMethod = String(req.query.code_challenge_method || "");

  if (responseType !== "code") {
    return oauthError(res, 400, "unsupported_response_type");
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    return oauthError(res, 400, "invalid_request", "redirect_uri is not allowed");
  }
  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return oauthError(res, 400, "invalid_request", "code_challenge_method must be S256");
  }
  if (!codeChallenge) {
    return oauthError(res, 400, "invalid_request", "PKCE S256 is required");
  }

  try {
    const client = open<{ redirect_uris?: string[] }>(clientId);
    if (Array.isArray(client.redirect_uris) && !client.redirect_uris.includes(redirectUri)) {
      return oauthError(res, 400, "invalid_request", "redirect_uri does not match registration");
    }
  } catch {
    // Claude may retry with a client_id we didn't issue; allowlisted redirect is enough.
  }

  if (!config.auth0_mcp_client_id || !config.auth0_mcp_client_secret) {
    return oauthError(res, 503, "temporarily_unavailable", "OAuth proxy is not configured");
  }

  let proxyState: string;
  try {
    proxyState = seal(
      {
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
      },
      STATE_TTL_SEC,
    );
  } catch (ex: any) {
    console.error("MCP OAuth authorize state error:", ex);
    return oauthError(res, 503, "temporarily_unavailable");
  }

  const auth0 = new URL(`${getAuth0Issuer()}authorize`);
  auth0.searchParams.set("client_id", config.auth0_mcp_client_id);
  auth0.searchParams.set("response_type", "code");
  auth0.searchParams.set("redirect_uri", `${getMcpIssuer()}/oauth/callback`);
  auth0.searchParams.set("scope", "openid offline_access");
  auth0.searchParams.set("audience", getMcpResourceUrl());
  auth0.searchParams.set("resource", getMcpResourceUrl());
  auth0.searchParams.set("state", proxyState);

  return res.redirect(302, auth0.toString());
}

export async function handleCallback(req: Request, res: Response) {
  const auth0Code = String(req.query.code || "");
  const proxyState = String(req.query.state || "");
  const auth0Error = req.query.error ? String(req.query.error) : undefined;

  let unpacked: { redirect_uri: string; state: string; code_challenge: string };
  try {
    unpacked = open(proxyState);
  } catch {
    return oauthError(res, 400, "invalid_request", "state is invalid or expired");
  }

  if (auth0Error || !auth0Code) {
    const deny = new URL(unpacked.redirect_uri);
    deny.searchParams.set("error", String(auth0Error || "access_denied"));
    if (unpacked.state) deny.searchParams.set("state", unpacked.state);
    return res.redirect(302, deny.toString());
  }

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    tokens = await exchangeAuth0Code(auth0Code);
  } catch (ex: any) {
    console.error("MCP OAuth Auth0 token exchange failed:", ex);
    const deny = new URL(unpacked.redirect_uri);
    deny.searchParams.set("error", "server_error");
    if (unpacked.state) deny.searchParams.set("state", unpacked.state);
    return res.redirect(302, deny.toString());
  }

  if (!tokens.access_token) {
    const deny = new URL(unpacked.redirect_uri);
    deny.searchParams.set("error", "server_error");
    if (unpacked.state) deny.searchParams.set("state", unpacked.state);
    return res.redirect(302, deny.toString());
  }

  const code = seal(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      redirect_uri: unpacked.redirect_uri,
      code_challenge: unpacked.code_challenge,
    },
    CODE_TTL_SEC,
  );

  const next = new URL(unpacked.redirect_uri);
  next.searchParams.set("code", code);
  if (unpacked.state) next.searchParams.set("state", unpacked.state);
  return res.redirect(302, next.toString());
}

export async function handleToken(req: Request, res: Response) {
  const grantType = String(req.body?.grant_type || "");
  if (grantType === "authorization_code") {
    return handleAuthorizationCode(req, res);
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(req, res);
  }
  return oauthError(res, 400, "unsupported_grant_type");
}

function handleAuthorizationCode(req: Request, res: Response) {
  const code = String(req.body?.code || "");
  const redirectUri = String(req.body?.redirect_uri || "");
  const verifier = String(req.body?.code_verifier || "");

  let payload: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    redirect_uri: string;
    code_challenge: string;
  };
  try {
    payload = open(code);
  } catch {
    return oauthError(res, 400, "invalid_grant", "code is invalid or expired");
  }

  if (payload.redirect_uri !== redirectUri) {
    return oauthError(res, 400, "invalid_grant", "redirect_uri mismatch");
  }
  if (!verifyPkceS256(verifier, payload.code_challenge)) {
    return oauthError(res, 400, "invalid_grant", "PKCE verification failed");
  }

  return res.json({
    access_token: payload.access_token,
    token_type: "Bearer",
    expires_in: payload.expires_in || 86400,
    refresh_token: payload.refresh_token,
    scope: authorizationPermissions.analysis_mcp,
  });
}

async function handleRefreshToken(req: Request, res: Response) {
  const refreshToken = String(req.body?.refresh_token || "");
  if (!refreshToken) return oauthError(res, 400, "invalid_request", "refresh_token is required");
  if (!config.auth0_mcp_client_id || !config.auth0_mcp_client_secret) {
    return oauthError(res, 503, "temporarily_unavailable");
  }

  try {
    const tokens = await auth0TokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (!tokens.access_token) {
      return oauthError(res, 400, "invalid_grant");
    }
    return res.json({
      access_token: tokens.access_token,
      token_type: "Bearer",
      expires_in: tokens.expires_in || 86400,
      refresh_token: tokens.refresh_token || refreshToken,
      scope: authorizationPermissions.analysis_mcp,
    });
  } catch (ex: any) {
    console.error("MCP OAuth refresh failed:", ex);
    return oauthError(res, 400, "invalid_grant");
  }
}

async function exchangeAuth0Code(code: string) {
  return auth0TokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${getMcpIssuer()}/oauth/callback`,
  });
}

async function auth0TokenRequest(params: Record<string, string>) {
  const body = new URLSearchParams({
    ...params,
    client_id: config.auth0_mcp_client_id,
    client_secret: config.auth0_mcp_client_secret,
  });
  const response = await fetch(`${getAuth0Issuer()}oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(json.error || `Auth0 token endpoint returned ${response.status}`);
  }
  return json as { access_token?: string; refresh_token?: string; expires_in?: number };
}
