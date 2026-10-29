import { DAO } from "../../custom_modules/DAO";
import { adminProcedure, router } from "../trpc";

/** Data for the admin's Home page that no other router owns */
export const homeRouter = router({
  /**
   * Monthly series for the headline stats' sparklines: the last 13 Oslo months, the current
   * month (so far) last. Money as decimal strings. See DAO_modules/homeTrends.ts.
   */
  trends: adminProcedure.query(() => DAO.homeTrends.getHomeTrends()),
});
