import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { buildOverview } from "../custom_modules/DAO_modules/analysis";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

export const analysisRouter = Router();

/**
 * @openapi
 * /analysis/overview:
 *   get:
 *    tags: [Analysis]
 *    description: Totals for the analysis overview in the admin panel. Collected this year,
 *      through time and open pledges, with pledges kept as a separate layer.
 */
analysisRouter.get("/overview", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const totals = await DAO.analysis.getOverviewTotals();

    res.json({
      status: 200,
      content: buildOverview(totals),
    });
  } catch (ex) {
    next(ex);
  }
});
