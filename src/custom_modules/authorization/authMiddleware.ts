import { DAO } from "../DAO";
import { claimCheck, JWTPayload, claimIncludes } from "express-oauth2-jwt-bearer";
import {
  authAdditionalIssuers,
  authAudience,
  authIssuerBaseURL,
  authMcpAudience,
  authUserIdClaim,
} from "../../config";
import authorizationPermissions from "../../enums/authorizationPermissions";
import { createJwtCheck } from "./jwtIssuers";

// Defaulting to "default" to enable tests to run
const additionalIssuers = authIssuerBaseURL ? authAdditionalIssuers : [];
const checkJwt = createJwtCheck(
  authAudience || "default",
  authIssuerBaseURL || "default",
  additionalIssuers,
);

// Claude Tag user-login tokens are issued for the MCP resource URL (…/mcp).
// M2M client-credentials tokens still use AUTH_AUDIENCE. Accept either here
// so both connector OAuth and the existing M2M app work on /mcp.
const mcpAudiences = [authAudience, authMcpAudience].filter(Boolean) as string[];
const checkMcpJwt = createJwtCheck(
  mcpAudiences.length > 0 ? mcpAudiences : "default",
  authIssuerBaseURL || "default",
  additionalIssuers,
);

const userIdClaim = authUserIdClaim;

/**
 * Express middleware, checks if token passed in request grants permission
 * If api is true, stops the request on fail and sends 401 unathorized
 * If api is false, sets req.authorized to true on success and false on fail, then calls next
 * @param {String} permission Shortname permission
 */
export const auth = (permission: any) => {
  return [checkJwt, claimIncludes("permissions", permission)];
};

export const isAdmin = auth(authorizationPermissions.admin);

export const isAnalysisMcp = [
  checkMcpJwt,
  claimIncludes("permissions", authorizationPermissions.analysis_mcp),
];

const userIsAdmin = (jwtPayload: JWTPayload) => {
  const permissionJwtPayload = jwtPayload.permissions;
  if (!Array.isArray(permissionJwtPayload)) return false;
  return permissionJwtPayload.includes("admin");
};

const userIsTheDonor = (jwtPayload: JWTPayload, donorId: number) =>
  jwtPayload[userIdClaim] === donorId;

const userIsAllowedToManageDonor = (jwtPayload: JWTPayload, donorId: number) =>
  userIsAdmin(jwtPayload) || userIsTheDonor(jwtPayload, donorId);

export const checkAdminOrTheDonor = (donorId: number, req, res, next) => {
  const handler = claimCheck((jwtPayload) => userIsAllowedToManageDonor(jwtPayload, donorId));
  handler(req, res, next);
};

export const checkDonorOwnsDistribution = (KID, req, res, next) => {
  DAO.donors
    .getByKID(KID)
    .then((donor) => {
      const handler = claimCheck((jwtPayload) => userIsAllowedToManageDonor(jwtPayload, donor.id));
      handler(req, res, next);
    })
    .catch((err) => {
      {
        next(new Error("Failed to verify ownershop of agreement"));
      }
    });
};
