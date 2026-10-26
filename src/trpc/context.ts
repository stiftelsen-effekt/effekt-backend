import type { Request, Response } from "express";
import type { JWTPayload } from "express-oauth2-jwt-bearer";
import { TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { authAdditionalIssuers, authAudience, authIssuerBaseURL } from "../config";
import { createJwtCheck } from "../custom_modules/authorization/jwtIssuers";

// Defaulting to "default" to enable tests to run, same as authMiddleware
const checkJwt = createJwtCheck(
  authAudience || "default",
  authIssuerBaseURL || "default",
  authIssuerBaseURL ? authAdditionalIssuers : [],
);

/**
 * Verifies the bearer token with the same Auth0 validator the REST routes use.
 * Requests without an Authorization header get an anonymous context; requests
 * with an invalid token are rejected rather than silently downgraded.
 */
const verifyToken = (req: Request, res: Response): Promise<JWTPayload | undefined> => {
  if (!req.headers.authorization) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    checkJwt(req, res, (err?: unknown) => {
      if (err) {
        reject(new TRPCError({ code: "UNAUTHORIZED", message: "Invalid token", cause: err }));
        return;
      }
      resolve(req.auth?.payload);
    });
  });
};

export const createContext = async ({ req, res }: CreateExpressContextOptions) => ({
  req,
  res,
  auth: await verifyToken(req, res),
});

export type Context = Awaited<ReturnType<typeof createContext>>;
