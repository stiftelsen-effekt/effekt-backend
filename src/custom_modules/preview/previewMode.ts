/**
 * Preview environments (one per pull request, see docs/preview-environments.md).
 *
 * With PREVIEW_MODE=true the API runs against seeded synthetic data and replaces Auth0 with
 * "Continue as…" sessions: POST /preview/session issues an HS256 token signed with
 * PREVIEW_JWT_SECRET (generated per preview by the pipeline). Those tokens are only accepted
 * while PREVIEW_MODE is on; with it off nothing in this file is used and the Auth0 checks are
 * unchanged.
 */
import { createHmac } from "crypto";
import type { RequestHandler } from "express";
import { auth as jwtBearer } from "express-oauth2-jwt-bearer";
import authorizationPermissions from "../../enums/authorizationPermissions";

export const PREVIEW_TOKEN_ISSUER = "urn:effekt:preview";
export const PREVIEW_TOKEN_AUDIENCE = "urn:effekt:preview:api";
export const PREVIEW_TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const PREVIEW_JWT_SECRET_MIN_LENGTH = 32;

/** Exactly "true" turns preview mode on; anything else (unset, "1", "TRUE") leaves it off. */
export const isPreviewMode = (env: NodeJS.ProcessEnv = process.env) => env.PREVIEW_MODE === "true";

export type PreviewUserId = "ops" | "finance" | "approver";

export type PreviewUser = {
  id: PreviewUserId;
  label: string;
  email: string;
  description: string;
};

/**
 * The people you can continue as. All are admins; there are three so two-person flows
 * (regranting approval: the approver must differ from the creator) can be tried.
 */
export const previewUsers: readonly PreviewUser[] = [
  {
    id: "ops",
    label: "Ops",
    email: "ops@example.org",
    description: "Day-to-day operations: donors, donations, imports",
  },
  {
    id: "finance",
    label: "Finance",
    email: "finance@example.org",
    description: "Reports, regranting rounds and payouts",
  },
  {
    id: "approver",
    label: "Approver",
    email: "approver@example.org",
    description: "Second person who approves what someone else prepared",
  },
];

export const findPreviewUser = (id: unknown): PreviewUser | undefined =>
  previewUsers.find((user) => user.id === id);

/** Admin and the donor-facing permissions, like the local mock issuer. Never analysis_mcp. */
export const previewPermissions = [
  authorizationPermissions.admin,
  authorizationPermissions.read_donations,
  authorizationPermissions.write_donations,
  authorizationPermissions.read_profile,
  authorizationPermissions.write_profile,
  authorizationPermissions.read_distributions,
  authorizationPermissions.write_distributions,
  authorizationPermissions.read_agreements,
  authorizationPermissions.write_agreements,
  authorizationPermissions.read_vipps_api,
  authorizationPermissions.write_vipps_api,
];

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

const requireSecret = (secret: string | undefined): string => {
  if (!secret || secret.length < PREVIEW_JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `PREVIEW_JWT_SECRET must be set to at least ${PREVIEW_JWT_SECRET_MIN_LENGTH} characters`,
    );
  }
  return secret;
};

export const signPreviewToken = (
  user: PreviewUser,
  secret: string | undefined,
  now = Math.floor(Date.now() / 1000),
) => {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    iss: PREVIEW_TOKEN_ISSUER,
    aud: PREVIEW_TOKEN_AUDIENCE,
    sub: `preview|${user.id}`,
    iat: now,
    exp: now + PREVIEW_TOKEN_TTL_SECONDS,
    email: user.email,
    name: user.label,
    given_name: user.label,
    permissions: previewPermissions,
  });
  const signature = createHmac("sha256", requireSecret(secret))
    .update(`${header}.${payload}`)
    .digest("base64url");
  return {
    accessToken: `${header}.${payload}.${signature}`,
    expiresIn: PREVIEW_TOKEN_TTL_SECONDS,
  };
};

/**
 * Verifies preview tokens with the same library (and the same req.auth.payload shape) as the
 * Auth0 check. Built on first use so a missing secret is reported by the startup guard rather
 * than crashing an import.
 */
export const createPreviewJwtCheck = (
  getSecret: () => string | undefined = () => process.env.PREVIEW_JWT_SECRET,
): RequestHandler => {
  let check: RequestHandler | undefined;
  return (req, res, next) => {
    try {
      check ??= jwtBearer({
        issuer: PREVIEW_TOKEN_ISSUER,
        audience: PREVIEW_TOKEN_AUDIENCE,
        secret: requireSecret(getSecret()),
        tokenSigningAlg: "HS256",
      });
    } catch (err) {
      next(err);
      return;
    }
    return check(req, res, next);
  };
};

/**
 * The JWT check for admin/donor routes: the preview check when PREVIEW_MODE is on, otherwise
 * the given (Auth0) check, untouched.
 */
export const selectJwtCheck = (
  productionCheck: () => RequestHandler,
  env: NodeJS.ProcessEnv = process.env,
): RequestHandler => (isPreviewMode(env) ? createPreviewJwtCheck() : productionCheck());
