import { DAO } from "../DAO";
import { auth as auth0, claimCheck, JWTPayload, claimIncludes } from "express-oauth2-jwt-bearer";
import { authAudience, authRoleClaim, authIssuerBaseURL, authUserIdClaim } from "../../config";

const authorizationRoles = require("../../enums/authorizationRoles.js");

// Defaulting to "default" to enable tests to run
const checkJwt = auth0({
  audience: authAudience || "default",
  issuerBaseURL: authIssuerBaseURL || "default",
});

const roleClaim = authRoleClaim;
const userIdClaim = authUserIdClaim;

/**
 * Express middleware, checks if token passed in request grants permission
 * If api is true, stops the request on fail and sends 401 unathorized
 * If api is false, sets req.authorized to true on success and false on fail, then calls next
 * @param {String} permission Shortname permission
 * @param {Boolean} [api=true] Indicates whether the request is an api request or a view request
 */
export const auth = (permission, api = true) => {
  return [checkJwt, claimIncludes("permissions", permission)];
};

const userIsAdmin = (claims: JWTPayload) => {
  const roleClaims = claims[roleClaim];
  if (!Array.isArray(roleClaims)) return false;
  return roleClaims.includes("admin");
};

const userIsTheDonor = (claims: JWTPayload, donorId: number) => claims[userIdClaim] === donorId;

const userIsAllowedToManageDonor = (claims: JWTPayload, donorId: number) =>
  userIsAdmin(claims) || userIsTheDonor(claims, donorId);

export const checkDonor = (donorId: number, req, res, next) => {
  const handler = claimCheck((claims) => userIsAllowedToManageDonor(claims, donorId));
  handler(req, res, next);
};

export const checkAvtaleGiroAgreement = (KID, req, res, next) => {
  DAO.donors
    .getByKID(KID)
    .then((donor) => {
      const handler = claimCheck((claims) => userIsAllowedToManageDonor(claims, donor.id));
      handler(req, res, next);
    })
    .catch((err) => {
      {
        next(new Error("Failed to verify ownershop of agreement"));
      }
    });
};

export const isAdmin = [checkJwt, claimIncludes("permissions", authorizationRoles.admin)];
