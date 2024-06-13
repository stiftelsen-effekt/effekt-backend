import { DAO } from "../../custom_modules/DAO";
import moment from "moment";

const dateRangeHelper = require("../../custom_modules/dateRangeHelper");

module.exports = async (req, res, next) => {
  try {
    let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req);

    if (req.body.paymentMethodIDs) {
      try {
        var paymentMethodIDs = req.body.paymentMethodIDs.split("|").map((n) => parseInt(n));
      } catch (ex) {
        res.json({
          status: 400,
          content:
            "Failed to parse payment method IDs. Should be passed on the form int|int|int, e.g. 3|5|8",
        });
      }

      var paymentMethods = await DAO.payment.getPaymentMethodsByIDs(paymentMethodIDs);
      var donationsFromRange = await DAO.donations.getFromRange(
        dates.fromDate,
        dates.toDate,
        paymentMethodIDs,
      );
    } else {
      var paymentMethods = await DAO.payment.getMethods();
      var donationsFromRange = await DAO.donations.getFromRange(dates.fromDate, dates.toDate);
    }

    if (req.body.filetype === "json") {
      res.json({
        status: 200,
        content: donationsFromRange,
      });
    } else {
      res.status(400).json({
        code: 400,
        content: "Please provide a query parameter 'filetype' with either excel or json as value",
      });
    }
  } catch (ex) {
    next(ex);
  }
};
