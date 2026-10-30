import { agreementsRouter } from "./routers/agreements";
import { analysisRouter } from "./routers/analysis";
import { configRouter } from "./routers/config";
import { donationsRouter } from "./routers/donations";
import { donorsRouter } from "./routers/donors";
import { giroRouter } from "./routers/giro";
import { homeRouter } from "./routers/home";
import { intentsRouter } from "./routers/intents";
import { metaRouter } from "./routers/meta";
import { minsideRouter } from "./routers/minside";
import { regrantingRouter } from "./routers/regranting";
import { reportsRouter } from "./routers/reports";
import { vippsRouter } from "./routers/vipps";
import { widgetRouter } from "./routers/widget";
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
  analysis: analysisRouter,
  intents: intentsRouter,
  home: homeRouter,
  // Donor-facing (Min Side on the website); everything above is admin-only
  minside: minsideRouter,
  // The public donation widget on the website (no login)
  widget: widgetRouter,
});

export type AppRouter = typeof appRouter;
