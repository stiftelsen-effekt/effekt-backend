import type { Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "./context";
import { appRouter } from "./router";

export const mountTrpc = (app: Express) => {
  // tRPC doesn't answer CORS preflights; the CORS headers are set by the global middleware
  app.options("/trpc/*", (req, res) => {
    res.sendStatus(204);
  });

  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path}:`, error);
      },
    }),
  );
};
