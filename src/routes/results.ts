import { Router } from "express";
import { DAO } from "../custom_modules/DAO";

export const resultsRouter = Router();

resultsRouter.get("/donations/daily", async (req, res, next) => {
  try {
    let dailyDonations = await DAO.results.getDailyDonations();

    res.json({
      status: 200,
      content: dailyDonations,
    });
  } catch (ex) {
    next(ex);
  }
});

resultsRouter.get("/referrals/sums", async (req, res, next) => {
  try {
    let referralSums = await DAO.results.getReferralSums();

    res.json({
      status: 200,
      content: referralSums,
    });
  } catch (ex) {
    next(ex);
  }
});
