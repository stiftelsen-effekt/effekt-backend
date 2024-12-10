import { Prisma } from "@prisma/client";
import { DAO } from "../../custom_modules/DAO";
import { VippsParsingRule } from "../../custom_modules/DAO_modules/parsing";
import { sendDonationReceipt } from "../../custom_modules/mail";
import {
  ParsedVippsReport,
  parseReport,
  VippsTransaction,
} from "../../custom_modules/parsers/vipps";
import payment from "../../enums/paymentMethods";
import { createHash } from "crypto";

const config = require("../../config");

module.exports = async (req, res, next) => {
  if (!req.files || !req.files.report) return res.sendStatus(400);
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  let parsedReport: ParsedVippsReport;
  let parsingRules: VippsParsingRule[];
  try {
    parsedReport = parseReport(req.files.report.data);
    parsingRules = await DAO.parsing.getVippsParsingRules(
      parsedReport.minDate,
      parsedReport.maxDate,
    );
  } catch (ex) {
    next(ex);
    return false;
  }

  let transactions = parsedReport.transactions;
  let invalidTransactions: {
    reason: string;
    transaction: VippsTransaction & { paymentID: number };
  }[] = [];
  let valid = 0;
  let invalid = 0;
  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    let matchingRule = checkForMatchingParsingRule(transaction, parsingRules);

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
          metaOwnerID,
        );
        valid++;
      } catch (ex) {
        console.error("Failed to update DB for vipps donation with KID: " + transaction.KID);
        console.error(ex);

        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          invalid++;
        } else {
          invalidTransactions.push({
            reason: ex.message,
            transaction: {
              ...transaction,
              paymentID: payment.vipps_KID,
            },
          });
          invalid++;
        }
      }

      try {
        if (config.env === "production") sendDonationReceipt(donationID);
      } catch (ex) {
        console.error("Failed to send donation reciept");
        console.error(ex);
      }
    } else if (matchingRule != false) {
      /**
       * Transaction matched against a parsing rule
       * An example could be the rule that "if the message says vipps, we automaticly assume standard split"
       * The rules are defined in the database
       */
      try {
        const donationId = await DAO.donations.add(
          matchingRule.KID,
          payment.vipps_KID,
          transaction.amount,
          transaction.date.toDate(),
          transaction.transactionID,
          metaOwnerID,
        );

        if (matchingRule.fundraiserId) {
          const donor = await DAO.donors.getByKID(matchingRule.KID);

          const hash = createHash("md5");
          hash.update(transaction.transactionID);
          const hexHash = hash.digest("hex");

          try {
            await DAO.adoveo.addFundraiserTransaction({
              Fundraiser_ID: matchingRule.fundraiserId,
              Donation_ID: donationId,
              Sum: transaction.amount as unknown as Prisma.Decimal,
              Timestamp: transaction.date.toDate(),
              Sender_email: donor.email,
              Sender_phone: "",
              Status: "SALE",
              Location: "VippsNumber",
              Hash: hexHash,
            });
          } catch (ex) {
            console.error("Failed to add fundraiser transaction");
            console.error(ex);
          }
        }
        valid++;
      } catch (ex) {
        console.error(
          "Failed to update DB for vipps donation that matched against a parsing rule with KID: " +
            transaction.KID,
        );
        console.error(ex);

        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          invalid++;
        } else {
          invalidTransactions.push({
            reason: ex.message,
            transaction: {
              ...transaction,
              paymentID: payment.vipps_KID,
            },
          });
          invalid++;
        }
      }
    } else {
      invalid++;
      invalidTransactions.push({
        reason: "Could not find valid KID or matching parsing rule",
        transaction: {
          ...transaction,
          paymentID: payment.vipps_KID,
        },
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

function checkForMatchingParsingRule(transaction, rules: VippsParsingRule[]) {
  for (let i = 0; i < rules.length; i++) {
    let rule = rules[i];
    if (
      rule.salesLocation == transaction.location &&
      (rule.message == transaction.message || rule.message == null || transaction.message == "")
    )
      return {
        KID: rule.resolveKID,
        fundraiserId: rule.resolveAdoveoFundraiserId,
      };
  }
  return false;
}
