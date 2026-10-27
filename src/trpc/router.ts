import { agreementsRouter } from "./routers/agreements";
import { configRouter } from "./routers/config";
import { donationsRouter } from "./routers/donations";
import { donorsRouter } from "./routers/donors";
import { giroRouter } from "./routers/giro";
import { metaRouter } from "./routers/meta";
import { regrantingRouter } from "./routers/regranting";
import { reportsRouter } from "./routers/reports";
import { vippsRouter } from "./routers/vipps";
import { router } from "./trpc";

export const appRouter = router({
  meta: metaRouter,
  config: configRouter,
  donors: donorsRouter,
  donations: donationsRouter,
  vipps: vippsRouter,
  giro: giroRouter,
  reports: reportsRouter,
  agreements: agreementsRouter,
  regranting: regrantingRouter,
});

export type AppRouter = typeof appRouter;
