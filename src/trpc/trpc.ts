import { initTRPC, TRPCError } from "@trpc/server";
import type { JWTPayload } from "express-oauth2-jwt-bearer";
import authorizationPermissions from "../enums/authorizationPermissions";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  isDev: process.env.NODE_ENV === "development",
});

const hasPermission = (payload: JWTPayload | undefined, permission: string) =>
  Array.isArray(payload?.permissions) && payload.permissions.includes(permission);

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.auth) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!hasPermission(ctx.auth, authorizationPermissions.admin)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
