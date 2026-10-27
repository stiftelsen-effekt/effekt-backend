import type { JWTPayload } from "express-oauth2-jwt-bearer";

/**
 * Who did something (resolved a review item, uploaded a report, created or approved a round):
 * the token's email claim (plain or namespaced, if the Auth0 tenant adds one), otherwise its
 * subject.
 */
export const adminIdentity = (auth: JWTPayload): string => {
  const emailClaim = Object.entries(auth).find(
    ([key, value]) => (key === "email" || key.endsWith("/email")) && typeof value === "string",
  );
  return (emailClaim?.[1] as string | undefined) ?? auth.sub ?? "unknown";
};
