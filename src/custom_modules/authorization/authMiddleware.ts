import { DAO } from "../DAO";
import { auth as auth0, claimCheck, JWTPayload, claimIncludes } from "express-oauth2-jwt-bearer";
import { authAudience, authIssuerBaseURL, authUserIdClaim } from "../../config";
import authorizationPermissions from "../../enums/authorizationPermissions";

// Defaulting to "default" to enable tests to run
const checkJwt = auth0({
  audience: authAudience || "default",
  issuerBaseURL: authIssuerBaseURL || "default",
});

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

export const checkAvtaleGiroAgreement = (KID, req, res, next) => {
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
