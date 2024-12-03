import { Router } from "express";
import { processFundraisingReport, processGiftCardsReport } from "../../custom_modules/adoveo";
import { isAdmin } from "../../custom_modules/authorization/authMiddleware";
import { processAmfDonations } from "../../custom_modules/amf";

export const amfReportRouter = Router();

amfReportRouter.post("/", isAdmin, async (req, res, next) => {
  const report = req.files.report;

  if (!report) {
    return res.status(400).json({
      status: 400,
      message: "Missing report",
    });
  }

  if (Array.isArray(report)) {
    return res.status(400).json({
      status: 400,
      message: "Multiple reports not supported",
    });
  }

  const result = await processAmfDonations(report.data);

  res.json({
    status: 200,
    content: result,
  });
});
