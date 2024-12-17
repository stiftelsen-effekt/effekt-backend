import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { AgreementReport } from "../custom_modules/DAO_modules/avtalegiroagreements";

export const ltvRouter = Router();

ltvRouter.get("/recentestimate", async (req, res, next) => {
  try {
    const latestLtv = await DAO.results.getRecentLTV();
    const avtaleGiroReport = await DAO.avtalegiroagreements.getAgreementReport();
    const vippsReport = await DAO.vipps.getAgreementReport();

    if (!latestLtv) {
      res.status(404).send("No LTV estimate found");
      return;
    }

    res.json({
      status: 200,
      content: latestLtv.map((ltv) => ({
        label: ltv.Label,
        expectedLtv: ltv.Expected_LTV,
        median: getMedian(avtaleGiroReport, vippsReport, ltv.Label),
      })),
    });
  } catch (error) {
    next(error);
  }
});

const getMedian: (
  avtaleGiroReport: AgreementReport | false,
  vippsReport: AgreementReport | false,
  label: string,
) => number | null = (avtaleGiroReport, vippsReport, label) => {
  if (label === "AvtaleGiro") {
    if (!avtaleGiroReport) {
      return null;
    }
    return parseFloat(avtaleGiroReport.medianAgreementSum);
  } else if (label === "Vipps") {
    if (!vippsReport) {
      return null;
    }
    return parseFloat(vippsReport.medianAgreementSum);
  } else {
    return null;
  }
};
