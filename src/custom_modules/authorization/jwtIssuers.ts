import { RequestHandler } from "express";
import { auth as auth0 } from "express-oauth2-jwt-bearer";

const withTrailingSlash = (url: string) => (url.endsWith("/") ? url : `${url}/`);

/**
 * Reads the iss claim of the bearer token without verifying it. Only used to pick
 * which issuer's validator verifies the token, never to trust the token.
 */
export const getUnverifiedIssuer = (authorization: string | undefined): string | undefined => {
  const match = /^Bearer\s+([^.\s]+)\.([^.\s]+)\.([^.\s]+)$/i.exec(authorization ?? "");
  if (!match) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8"));
    return typeof payload.iss === "string" ? payload.iss : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Creates a JWT check that accepts tokens from the primary issuer and from any
 * additional issuers. Additional issuers are custom domains of the same Auth0
 * tenant (e.g. https://login.gieffektivt.no/): their tokens are signed with the
 * tenant's keys, so they are verified against the primary issuer's JWKS.
 */
export const createJwtCheck = (
  audience: string | string[],
  issuerBaseURL: string,
  additionalIssuers: string[] = [],
): RequestHandler => {
  const primaryCheck = auth0({ audience, issuerBaseURL });
  if (additionalIssuers.length === 0) return primaryCheck;

  const jwksUri = new URL(".well-known/jwks.json", withTrailingSlash(issuerBaseURL)).toString();
  const checksByIssuer = new Map(
    additionalIssuers.map((issuer) => {
      const normalizedIssuer = withTrailingSlash(issuer);
      return [normalizedIssuer, auth0({ audience, issuer: normalizedIssuer, jwksUri })];
    }),
  );

  return (req, res, next) => {
    const issuer = getUnverifiedIssuer(req.headers.authorization);
    const check = (issuer && checksByIssuer.get(issuer)) || primaryCheck;
    return check(req, res, next);
  };
};
