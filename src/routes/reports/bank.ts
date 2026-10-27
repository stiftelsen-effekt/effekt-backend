import { enqueueInvalidTransactions } from "../../custom_modules/reviewQueue";
import { isAdmin } from "../../custom_modules/authorization/authMiddleware";
import { Router } from "express";
import { processBankNoReport, processBankSeReport } from "../../custom_modules/reportsService";

export const bankReportRouter = Router();

bankReportRouter.post("/no", isAdmin, async (req, res, next) => {
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  var data = req.files.report.data.toString("UTF-8");

  try {
    var result = await processBankNoReport(data, metaOwnerID);
  } catch (ex) {
    return next(ex);
  }

  await enqueueInvalidTransactions("bankNo", result.invalidTransactions);

  res.json({
    status: 200,
    content: result,
  });
});

bankReportRouter.post("/se", isAdmin, async (req, res, next) => {
  if (req.files === null || req.files.report === undefined) {
    return res.status(400).json({
      status: 400,
      message: "Missing report",
    });
  }

  if (Array.isArray(req.files.report)) {
    return res.status(400).json({
      status: 400,
      message: "Multiple reports not supported",
    });
  }

  // Check for dry run mode (query param or body)
  const dryRun = req.query.dryRun === "true" || req.body.dryRun === true;

  const data = req.files.report.data.toString();

  try {
    var result = await processBankSeReport(data, dryRun);
  } catch (ex) {
    return next(ex);
  }

  if (!dryRun) await enqueueInvalidTransactions("bankSe", result.invalidTransactions);

  res.json({
    status: 200,
    content: result,
  });
});
