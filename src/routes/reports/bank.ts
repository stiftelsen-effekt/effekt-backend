import { DAO } from "../../custom_modules/DAO";
import { sendEffektDonationReciept, sendDonationReceipt } from "../../custom_modules/mail";
import { parseReport } from "../../custom_modules/parsers/bank";

const config = require("../../config");

const BANK_NO_KID_ID = 5;

module.exports = async (req, res, next) => {
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  var data = req.files.report.data.toString("UTF-8");

  try {
    var transactions = parseReport(data);
  } catch (ex) {
    return next(ex);
  }

  let valid = 0;
  let invalid = 0;
  let invalidTransactions = [];
  for (let i = 0; i < transactions.length; i++) {
    let transaction = transactions[i];
    transaction.paymentID = BANK_NO_KID_ID;

    if (transaction.KID != null) {
      /**
       * Managed to grab a KID straight from the message field, go ahead and add to DB
       */
      let donationID;
      try {
        donationID = await DAO.donations.add(
          transaction.KID,
          BANK_NO_KID_ID,
          transaction.amount,
          transaction.date.toDate(),
          transaction.transactionID,
          metaOwnerID,
        );
        valid++;
      } catch (ex) {
        //If the donation already existed, ignore and keep moving
        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          invalid++;
          continue;
        } else {
          console.error(
            "Failed to update DB for bank_custom donation with KID: " + transaction.KID,
          );
          console.error(ex);

          invalidTransactions.push({
            reason: ex.message,
            transaction,
          });
          invalid++;
          continue;
        }
      }

      try {
        if (config.env === "production") {
          if (metaOwnerID === 1) {
            //Send special reciept if the donation is for the old effekt system
            await sendEffektDonationReciept(donationID);
          } else {
            await sendDonationReceipt(donationID);
          }
        }
      } catch (ex) {
        console.error("Failed to send donation reciept");
        console.error(ex);
      }
    } else if (false) {
      /**
       * Transaction matched against a parsing rule
       * An example could be the rule that "if the message says vipps, we automaticly assume standard split"
       * The rules are defined in the database
       */
    } else {
      invalidTransactions.push({
        reason: "Could not find valid KID or matching parsing rule",
        transaction: transaction,
      });
      invalid++;
    }
  }

  res.json({
    status: 200,
    content: {
      valid,
      invalid,
      invalidTransactions,
    },
  });
};
