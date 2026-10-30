import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { getMonthlyDonationsPerOutput } from "../custom_modules/monthlyOutputs";

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

resultsRouter.get("/headline", async (req, res, next) => {
  try {
    let headline = await DAO.results.getHeadlineFigures();

    res.json({
      status: 200,
      content: headline,
    });
  } catch (ex) {
    next(ex);
  }
});

resultsRouter.get("/donations/monthly/outputs", async (req, res, next) => {
  try {
    const result = await getMonthlyDonationsPerOutput();

    res.json({
      status: 200,
      content: result,
    });
  } catch (ex) {
    next(ex);
  }
});
