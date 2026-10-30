import { enqueueInvalidTransactions } from "../../custom_modules/reviewQueue";
import { processAutogiroReport } from "../../custom_modules/reportsService";

module.exports = async (req, res, next) => {
  try {
    const result = await processAutogiroReport(req.files.report.data);

    if (result.type === "payments") {
      await enqueueInvalidTransactions("autogiro", result.invalidTransactions);
      res.json({
        status: 200,
        content: {
          valid: result.valid,
          invalid: result.invalid,
          invalidTransactions: result.invalidTransactions,
        },
      });
    } else if (result.type === "eMandates") {
      res.json({
        status: 200,
        content: {
          newMandates: result.newMandates,
          invalid: 0,
        },
      });
    } else if (result.type === "rejectedCharges") {
      res.json({
        status: 200,
        content: {
          rejectedCharges: result.rejectedCharges,
          failedRejectedCharges: result.failedRejectedCharges,
        },
      });
    } else if (result.type === "mandates") {
      res.json({
        status: 200,
        content: {
          confirmed: result.confirmed,
          cancelled: result.cancelled,
          invalid: result.invalid,
          rejected: result.rejected,
          invalidMandates: result.invalidMandates,
        },
      });
    } else {
      /**
       * TODO: Handle other file types
       */
      res.json({
        status: 200,
        content: {
          valid: 0,
          invalid: 0,
        },
      });
    }
  } catch (ex) {
    return next({ ex: ex });
  }
};
