import { initTRPC, TRPCError } from "@trpc/server";
import type { JWTPayload } from "express-oauth2-jwt-bearer";
import { z } from "zod";
import authorizationPermissions from "../enums/authorizationPermissions";
import type { Context } from "./context";
import { toInputError } from "./errors";

const isDev = process.env.NODE_ENV === "development";

const t = initTRPC.context<Context>().create({
  isDev,
  errorFormatter: ({ shape, error }) => {
    if (error.cause instanceof z.ZodError) {
      return {
        ...shape,
        message: z.prettifyError(error.cause),
        data: { ...shape.data, fieldErrors: z.flattenError(error.cause).fieldErrors },
      };
    }
    // Internal errors can carry SQL and other internals; only show them in development
    if (error.code === "INTERNAL_SERVER_ERROR" && !isDev) {
      return { ...shape, message: "Internal server error" };
    }
    return shape;
  },
});

const hasPermission = (payload: JWTPayload | undefined, permission: string) =>
  Array.isArray(payload?.permissions) && payload.permissions.includes(permission);

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
    const inputError = toInputError(result.error.cause);
    if (inputError) throw inputError;
  }
  return result;
});

export const authedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.auth) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!hasPermission(ctx.auth, authorizationPermissions.admin)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
