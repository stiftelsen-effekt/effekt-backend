import { metaRouter } from "./routers/meta";
import { router } from "./trpc";

export const appRouter = router({
  meta: metaRouter,
});

export type AppRouter = typeof appRouter;
