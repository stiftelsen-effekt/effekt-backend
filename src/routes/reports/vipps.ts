import { enqueueInvalidTransactions } from "../../custom_modules/reviewQueue";
import { processVippsReport } from "../../custom_modules/reportsService";

module.exports = async (req, res, next) => {
  if (!req.files || !req.files.report) return res.sendStatus(400);
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  let result;
  try {
    result = await processVippsReport(req.files.report.data, metaOwnerID);
  } catch (ex) {
    next(ex);
    return false;
  }

  await enqueueInvalidTransactions("vipps", result.invalidTransactions);

  res.json({
    status: 200,
    content: {
      valid: result.valid,
      invalid: result.invalid,
      invalidTransactions: result.invalidTransactions,
    },
  });
};
