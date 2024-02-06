import { DAO } from "../../custom_modules/DAO";
import { isAdmin } from "../../custom_modules/authorization/authMiddleware";
import { sendEffektDonationReciept, sendDonationReceipt } from "../../custom_modules/mail";
import { parseReport } from "../../custom_modules/parsers/bank";
import { Router } from "express";
import { RecordType, parseTotalInFile } from "../../custom_modules/parsers/sebank";
import { DateTime } from "luxon";

const config = require("../../config");

const BANK_NO_KID_ID = 5;

export const bankReportRouter = Router();

bankReportRouter.post("/no", isAdmin, async (req, res, next) => {
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
});

bankReportRouter.post("/se", isAdmin, async (req, res, next) => {
  if (req.files === null || req.files.report === undefined) {
    return res.status(400).json({
      status: 400,
      message: "Missing report",
    });
  }

  if (Array.isArray(req.files.report)) {
    return res.status(400).json({
      status: 400,
      message: "Multiple reports not supported",
    });
  }

  var data = req.files.report.data.toString();

  try {
    var records = parseTotalInFile(data);
  } catch (ex) {
    return next(ex);
  }

  let payments: { amount: number; externalReference: string; KID: string }[] = [];
  let postingDate: DateTime;
  for (const record of records) {
    if (record.recordType === RecordType.AccountAndCurrencyStartRecord) {
      postingDate = DateTime.fromFormat(record.postingDate, "yyyyMMdd");
    } else if (record.recordType === RecordType.PaymentRecord) {
      payments.push({
        amount: parseFloat(record.amount),
        externalReference: record.transactionSerialNumber,
        KID: "",
      });
    } else if (record.recordType === RecordType.MessageRecord) {
      // Add KID to last payment
      payments[payments.length - 1].KID = record.messages[0];
    }
  }

  // Filter out Swish payments
  payments = payments.filter((p) => p.KID !== "OrderID:");

  for (let payment of payments) {
    // Let's see if we can find the distribution
    try {
      const exists = await DAO.distributions.KIDexists(payment.KID);
      if (!exists) {
        console.log(`Did not find distribution for KID: ${payment.KID}`);
        console.log(`Looking for legacy distribution`);

        const latestDonation = await DAO.donations.getLatestByLegacySeDistribution(payment.KID);

        if (latestDonation) {
          console.log(`Found legacy donation with ID: ${latestDonation.ID}`);
          const paymentKID = latestDonation.KID_fordeling;
          payment.KID = paymentKID;
        } else {
          console.log(`Did not find legacy distribution for KID: ${payment.KID}`);
          continue;
        }
      }

      // Add donation
      console.log(
        `Adding donation for KID: ${payment.KID} with amount: ${payment.amount} and externalReference: ${payment.externalReference}`,
      );
      const donationId = await DAO.donations.add(
        payment.KID,
        2,
        payment.amount / 100,
        postingDate.toJSDate(),
        payment.externalReference,
      );
      continue;
    } catch (ex) {
      console.error(`Failed to find distribution for KID: ${payment.KID}`, ex);
      continue;
    }
  }

  res.json({
    status: 200,
    content: payments,
  });
});
