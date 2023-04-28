import { DAO } from "../DAO";
import {
  auth as auth0,
  requiredScopes,
  claimCheck,
  JWTPayload,
  claimIncludes,
} from "express-oauth2-jwt-bearer";

const authorizationRoles = require("../../enums/authorizationRoles.js");

// const checkJwt = auth0({
//   audience: "https://data.gieffektivt.no",
//   issuerBaseURL: "https://gieffektivt.eu.auth0.com/",
// });

const checkJwt = auth0({
  audience: "geeffektivt.se",
  issuerBaseURL: "https://geeffektivt.eu.auth0.com/",
});

const roleClaim = "https://gieffektivt.no/roles";
const useridClaim = "https://gieffektivt.no/user-id";

interface ExtendedJWTPayload extends JWTPayload {
  [roleClaim]: string[];
  [useridClaim]: number;
}

/**
 * Express middleware, checks if token passed in request grants permission
 * If api is true, stops the request on fail and sends 401 unathorized
 * If api is false, sets req.authorized to true on success and false on fail, then calls next
 * @param {String} permission Shortname permission
 * @param {Boolean} [api=true] Indicates whether the request is an api request or a view request
 */
export const auth = (permission, api = true) => {
  return [checkJwt, requiredScopes(permission)];
};

export const checkDonor = (donorId, req, res, next) => {
  const handler = claimCheck(
    (claims) =>
      (claims as ExtendedJWTPayload)[roleClaim].includes("admin") ||
      claims[useridClaim] === donorId
  );
  handler(req, res, next);
};

export const checkAvtaleGiroAgreement = (KID, req, res, next) => {
  DAO.donors
    .getByKID(KID)
    .then((donor) => {
      const handler = claimCheck(
        (claims) =>
          (claims as ExtendedJWTPayload)[roleClaim].includes("admin") ||
          (claims as ExtendedJWTPayload)[useridClaim] === donor.id
      );
      handler(req, res, next);
    })
    .catch((err) => {
      {
        next(new Error("Failed to verify ownershop of agreement"));
      }
    });
};

export const isAdmin = [
  checkJwt,
  claimIncludes("permissions", authorizationRoles.admin),
];
