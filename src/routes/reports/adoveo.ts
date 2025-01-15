import { Router } from "express";
import { processFundraisingReport, processGiftCardsReport } from "../../custom_modules/adoveo";
import { isAdmin } from "../../custom_modules/authorization/authMiddleware";

export const adoveoReportRouter = Router();

adoveoReportRouter.post("/fundraiser/:id", isAdmin, async (req, res, next) => {
  const fundraiserId = req.params.id;
  if (!fundraiserId) {
    return res.status(400).json({
      status: 400,
      message: "Missing fundraiserId",
    });
  }
  const parsedFundraiserId = parseInt(fundraiserId);
  if (isNaN(parsedFundraiserId)) {
    return res.status(400).json({
      status: 400,
      message: "Invalid fundraiserId",
    });
  }

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

  const result = await processFundraisingReport(report.data, parsedFundraiserId);

  res.json({
    status: 200,
    content: result,
  });
});

adoveoReportRouter.post("/giftcards/:id", isAdmin, async (req, res, next) => {
  const giftcardId = req.params.id;
  if (!giftcardId) {
    return res.status(400).json({
      status: 400,
      message: "Missing fundraiserId",
    });
  }
  const parsedGiftcardId = parseInt(giftcardId);

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

  const result = await processGiftCardsReport(report.data, parsedGiftcardId);

  res.json({
    status: 200,
    content: result,
  });
});
