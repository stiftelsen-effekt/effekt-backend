import type { Express, RequestHandler } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "./context";
import { passMultipartBodyToTrpc, TRPC_MAX_BODY_SIZE } from "./reportsMultipart";
import { appRouter } from "./router";

/**
 * The public widget mutations (widget.registerDonation, widget.draftVippsAgreement etc.) create
 * donors, agreements and payments without a login, so the per-IP rate limit has to count each one.
 * A batch request (`/trpc/a,b?batch=1`) would run many procedures in one counted request, so a
 * batch that includes one of them is refused. The website's widget client never batches.
 */
export const publicMutations = new Set(
  Object.entries(appRouter._def.procedures as unknown as Record<string, { _def: { type: string } }>)
    .filter(([path, procedure]) => path.startsWith("widget.") && procedure._def.type === "mutation")
    .map(([path]) => path),
);

export const rejectBatchedWidgetMutations: RequestHandler = (req, res, next) => {
  const paths = decodeURIComponent(req.path.replace(/^\//, "")).split(",");
  if (paths.length > 1 && paths.some((path) => publicMutations.has(path))) {
    res.status(400).json({
      error: {
        message: "Widget mutations cannot be batched",
        code: -32600,
        data: { code: "BAD_REQUEST", httpStatus: 400 },
      },
    });
    return;
  }
  next();
};

/**
 * Runs the limiter for single (unbatched) calls of the public widget mutations
 */
const limitPublicMutations =
  (limiter: RequestHandler): RequestHandler =>
  (req, res, next) => {
    const path = decodeURIComponent(req.path.replace(/^\//, ""));
    if (req.method === "POST" && publicMutations.has(path)) return limiter(req, res, next);
    next();
  };

/**
 * @param options.publicMutationLimiter Per-IP limiter for the public widget mutations
 *   (server.ts passes the one it also uses for the public REST donation routes)
 */
export const mountTrpc = (
  app: Express,
  options: { publicMutationLimiter?: RequestHandler } = {},
) => {
  // tRPC doesn't answer CORS preflights; the CORS headers are set by the global middleware
  app.options("/trpc/*", (req, res) => {
    res.sendStatus(204);
  });

  app.use(
    "/trpc",
    rejectBatchedWidgetMutations,
    ...(options.publicMutationLimiter ? [limitPublicMutations(options.publicMutationLimiter)] : []),
    passMultipartBodyToTrpc,
    createExpressMiddleware({
      router: appRouter,
      createContext,
      maxBodySize: TRPC_MAX_BODY_SIZE,
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error("tRPC %s:", path, error);
      },
    }),
  );
};
