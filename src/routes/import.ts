import { Router } from "express";
import {
  connectLegacySwedishDistributions,
  importSwedishDonationsReport,
} from "../custom_modules/import";
import { isAdmin } from "../custom_modules/authorization/authMiddleware";

export const importRouter = Router();

importRouter.post("/donations/se", isAdmin, async (req, res, next) => {
  const report = req.files.report;
  const medgivandeReport = req.files.medgivandeReport;

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

  if (Array.isArray(medgivandeReport)) {
    return res.status(400).json({
      status: 400,
      message: "Multiple medgivandeReports not supported",
    });
  }

  const result = await importSwedishDonationsReport(report.data, medgivandeReport?.data ?? null);

  res.json({
    status: 200,
    content: result,
  });
});

importRouter.post("/donations/se/legacy", isAdmin, async (req, res, next) => {
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

  const result = await connectLegacySwedishDistributions(report.data);

  res.json({
    status: 200,
    content: result,
  });
});
