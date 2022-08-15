import { DAO } from "../../custom_modules/DAO";
import { sendDonationReciept } from "../../custom_modules/mail";

const vippsParser = require("../../custom_modules/parsers/vipps.js");
const config = require("../../config");
const payment = require("../../enums/paymentMethods");

module.exports = async (req, res, next) => {
  if (!req.files || !req.files.report) return res.sendStatus(400);
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  let parsedReport;
  let parsingRules;
  try {
    parsedReport = vippsParser.parseReport(req.files.report.data);
    parsingRules = await DAO.parsing.getVippsParsingRules(
      parsedReport.minDate,
      parsedReport.maxDate
    );
  } catch (ex) {
    next(ex);
    return false;
  }

  let transactions = parsedReport.transactions;
  let invalidTransactions = [];
  let valid = 0;
  let invalid = 0;
  for (let i = 0; i < transactions.length; i++) {
    let transaction = transactions[i];
    transaction.paymentID = payment.vipps_KID;
    let matchingRuleKID = checkForMatchingParsingRule(
      transaction,
      parsingRules
    );

    if (transaction.KID != null) {
      /**
       * Managed to grab a KID straight from the message field, go ahead and add to DB
       */
      let donationID;
      try {
        donationID = await DAO.donations.add(
          transaction.KID,
          payment.vipps_KID,
          transaction.amount,
          transaction.date.toDate(),
          transaction.transactionID,
          metaOwnerID
        );
        valid++;
      } catch (ex) {
        console.error(
          "Failed to update DB for vipps donation with KID: " + transaction.KID
        );
        console.error(ex);

        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          invalid++;
        } else {
          invalidTransactions.push({
            reason: ex.message,
            transaction: transaction,
          });
          invalid++;
        }
      }

      try {
        if (config.env === "production") sendDonationReciept(donationID);
      } catch (ex) {
        console.error("Failed to send donation reciept");
        console.error(ex);
      }
    } else if (matchingRuleKID != false) {
      /**
       * Transaction matched against a parsing rule
       * An example could be the rule that "if the message says vipps, we automaticly assume standard split"
       * The rules are defined in the database
       */
      try {
        await DAO.donations.add(
          matchingRuleKID,
          payment.vipps_KID,
          transaction.amount,
          transaction.date.toDate(),
          transaction.transactionID,
          metaOwnerID
        );
        valid++;
      } catch (ex) {
        console.error(
          "Failed to update DB for vipps donation that matched against a parsing rule with KID: " +
            transaction.KID
        );
        console.error(ex);

        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          invalid++;
        } else {
          invalidTransactions.push({
            reason: ex.message,
            transaction: transaction,
          });
          invalid++;
        }
      }
    } else {
      invalid++;
      invalidTransactions.push({
        reason: "Could not find valid KID or matching parsing rule",
        transaction: transaction,
      });
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

function checkForMatchingParsingRule(transaction, rules) {
  for (let i = 0; i < rules.length; i++) {
    let rule = rules[i];
    if (
      rule.salesLocation == transaction.location &&
      (rule.message == transaction.message ||
        rule.message == null ||
        transaction.message == "")
    )
      return rule.resolveKID;
  }
  return false;
}
