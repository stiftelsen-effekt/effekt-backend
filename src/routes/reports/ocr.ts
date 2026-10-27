import { enqueueInvalidTransactions } from "../../custom_modules/reviewQueue";
import { processOcrReport } from "../../custom_modules/reportsService";

module.exports = async (req, res, next) => {
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  var data = req.files.report.data.toString("UTF-8");

  try {
    var result = await processOcrReport(data, metaOwnerID);
  } catch (ex) {
    return next(ex);
  }

  await enqueueInvalidTransactions("ocr", result.invalidTransactions);

  res.json({
    status: 200,
    content: {
      valid: result.valid,
      //Not used
      invalid: result.invalid,
      invalidTransactions: result.invalidTransactions,
    },
  });
};
