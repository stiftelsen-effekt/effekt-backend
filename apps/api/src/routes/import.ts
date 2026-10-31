import { Router } from "express";
import { connectLegacySwedishDistributions } from "../custom_modules/import";
import { isAdmin } from "../custom_modules/authorization/authMiddleware";

export const importRouter = Router();

importRouter.post("/donations/se/legacy", isAdmin, async (req, res) => {
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
