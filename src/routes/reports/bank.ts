import { DAO } from "../../custom_modules/DAO";
import { isAdmin } from "../../custom_modules/authorization/authMiddleware";
import { sendDonationReceipt } from "../../custom_modules/mail";
import { parseReport } from "../../custom_modules/parsers/bank";
import { Router } from "express";
import { RecordType, parseTotalInFile } from "../../custom_modules/parsers/sebank";
import { parseCamtFile, isCamtXml } from "../../custom_modules/parsers/camtParser";
import { DateTime } from "luxon";

const config = require("../../config");

const BANK_NO_KID_ID = 5;
const BANK_SE_PAYMENT_ID = 2;
const SWISH_PAYMENT_ID = 11;

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
          await sendDonationReceipt(donationID);
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

// TODO: Restore isAdmin middleware before committing
bankReportRouter.post(
  "/se",
  /* isAdmin, */ async (req, res, next) => {
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

    // Check for dry run mode (query param or body)
    const dryRun = req.query.dryRun === "true" || req.body.dryRun === true;

    const data = req.files.report.data.toString();

    // Auto-detect format and parse
    let payments: {
      amount: number;
      externalReference: string;
      messages: string[];
      KID?: string;
      donorName?: string;
    }[] = [];
    let postingDate: DateTime;
    let fileFormat: "xml" | "totalin";

    try {
      if (isCamtXml(data)) {
        fileFormat = "xml";
        // Parse ISO 20022 CAMT.053 XML format
        const result = parseCamtFile(data);
        postingDate = DateTime.fromISO(result.postingDate);
        payments = result.transactions.map((tx) => ({
          amount: tx.amount * 100, // Convert to öre to match existing logic
          externalReference: tx.externalReference,
          messages: tx.messages,
          donorName: tx.donorName,
        }));
      } else {
        fileFormat = "totalin";
        // Parse fixed-width TotalIn format
        const records = parseTotalInFile(data);
        for (const record of records) {
          if (record.recordType === RecordType.AccountAndCurrencyStartRecord) {
            postingDate = DateTime.fromFormat(record.postingDate, "yyyyMMdd");
          } else if (record.recordType === RecordType.PaymentRecord) {
            payments.push({
              amount: parseFloat(record.amount),
              externalReference: record.transactionSerialNumber,
              messages: [],
            });
          } else if (record.recordType === RecordType.MessageRecord) {
            // Add messages to last payment
            payments[payments.length - 1].messages.push(record.messages[0]);
            payments[payments.length - 1].messages.push(record.messages[1]);
          }
        }
      }
    } catch (ex) {
      return next(ex);
    }

    let valid = 0;
    let invalid = 0;
    let skippedSwish = 0;
    let skippedDuplicate = 0;
    let invalidTransactions = [];
    let validTransactions = []; // For dry run reporting

    for (const payment of payments) {
      try {
        // Check if this is a Swish transaction
        const isSwish = payment.messages.some((m) => m.includes("Swishnummer:"));

        if (isSwish) {
          // Extract OrderID value to determine Swish type
          const orderIdLine = payment.messages.find((m) => m.includes("OrderID:"));
          const orderId = orderIdLine?.split("OrderID:")[1]?.trim();

          if (orderId && /^\d{11}$/.test(orderId)) {
            // Your Swish widget - 11 digit reference (YYMMDD + 5 random)
            // Check if already processed in your system
            const existingDonation = await DAO.donations.getByExternalPaymentID(
              orderId,
              SWISH_PAYMENT_ID,
            );
            if (existingDonation) {
              // Skip - already handled by Swish system
              skippedSwish++;
              if (dryRun) {
                console.log(
                  `[DRY RUN] Skipping Swish (already in DB): ${orderId} - ${
                    payment.amount / 100
                  } SEK`,
                );
              }
              continue;
            }
            // Swish reference exists but no donation found - add to manual processing
            invalid++;
            invalidTransactions.push({
              reason: "Swish reference not found in database - may need investigation",
              transaction: {
                date: postingDate,
                message: payment.messages.join(", "),
                amount: payment.amount / 100,
                transactionID: payment.externalReference,
                donorName: payment.donorName,
                paymentID: BANK_SE_PAYMENT_ID,
              },
            });
            continue;
          } else if (!orderId || orderId.toLowerCase().includes("adoveo")) {
            // Adoveo Swish - skip (handled by Adoveo)
            skippedSwish++;
            if (dryRun) {
              console.log(
                `[DRY RUN] Skipping Adoveo Swish: ${payment.externalReference} - ${
                  payment.amount / 100
                } SEK`,
              );
            }
            continue;
          } else {
            // Direct Swish (no OrderID or unrecognized format) - needs manual processing
            invalid++;
            invalidTransactions.push({
              reason: "Direct Swish donation - needs manual processing",
              transaction: {
                date: postingDate,
                message: payment.messages.join(", "),
                amount: payment.amount / 100,
                transactionID: payment.externalReference,
                donorName: payment.donorName,
                paymentID: BANK_SE_PAYMENT_ID,
              },
            });
            continue;
          }
        }

        // Not a Swish transaction - process normally with KID matching

        // First, check for existing donation
        const existingDonation = await DAO.donations.getByExternalPaymentID(
          payment.externalReference,
          BANK_SE_PAYMENT_ID,
        );
        if (existingDonation) {
          skippedDuplicate++;
          if (dryRun) {
            console.log(
              `[DRY RUN] Skipping duplicate: ${payment.externalReference} - ${
                payment.amount / 100
              } SEK (existing donation ID: ${existingDonation.ID})`,
            );
          }
          continue;
        }

        // Try to find KID
        let kidFound = false;
        for (const message of payment.messages) {
          // Get consecutive digits from message
          const sanitizedMessage = message.trim().replace(/\D/g, "");
          if (dryRun) {
            console.log(`[DRY RUN] Checking KID candidate: ${sanitizedMessage}`);
          }
          if (sanitizedMessage.length < 8) {
            continue;
          }
          if (await DAO.distributions.KIDexists(sanitizedMessage)) {
            kidFound = true;
            payment.KID = sanitizedMessage;
            break;
          }
          const prefixMatches = await DAO.distributions.getKIDsByPrefix(sanitizedMessage);
          if (prefixMatches.length === 1 && sanitizedMessage.length >= 10) {
            kidFound = true;
            payment.KID = prefixMatches[0];
            break;
          }
        }

        if (!kidFound) {
          if (dryRun) {
            console.log(`[DRY RUN] Did not find distribution for KID: ${payment.KID}`);
            console.log(`[DRY RUN] Looking for legacy distribution`);
          }

          let latestDonation;
          for (const message of payment.messages) {
            latestDonation = await DAO.donations.getLatestByLegacySeDistribution(message.trim());
            if (latestDonation) {
              payment.KID = latestDonation.KID_fordeling;
              break;
            }
          }

          if (latestDonation) {
            if (dryRun) {
              console.log(`[DRY RUN] Found legacy donation with ID: ${latestDonation.ID}`);
            }
            payment.KID = latestDonation.KID_fordeling;
          } else {
            if (dryRun) {
              console.log(`[DRY RUN] Did not find legacy distribution for KID: ${payment.KID}`);
            }
            invalid++;
            invalidTransactions.push({
              reason: "Did not find distribution for KID",
              transaction: {
                date: postingDate,
                message: payment.messages.join(", "),
                amount: payment.amount / 100,
                transactionID: payment.externalReference,
                donorName: payment.donorName,
                paymentID: BANK_SE_PAYMENT_ID,
              },
            });
            continue;
          }
        }

        // Add donation (or just log in dry run mode)
        if (dryRun) {
          console.log(
            `[DRY RUN] Would add donation: KID=${payment.KID}, amount=${
              payment.amount / 100
            } SEK, ref=${payment.externalReference}`,
          );
          validTransactions.push({
            KID: payment.KID,
            amount: payment.amount / 100,
            transactionID: payment.externalReference,
            donorName: payment.donorName,
            date: postingDate,
            message: payment.messages.join(", "),
          });
        } else {
          console.log(
            `Adding donation for KID: ${payment.KID} with amount: ${payment.amount} and externalReference: ${payment.externalReference}`,
          );
          await DAO.donations.add(
            payment.KID,
            BANK_SE_PAYMENT_ID,
            payment.amount / 100,
            postingDate.toJSDate(),
            payment.externalReference,
          );
        }
        valid++;
      } catch (ex) {
        invalid++;
        invalidTransactions.push({
          reason: ex.message,
          transaction: {
            date: postingDate,
            message: payment.messages.join(", "),
            amount: payment.amount / 100,
            KID: payment.KID,
            transactionID: payment.externalReference,
            donorName: payment.donorName,
            paymentID: BANK_SE_PAYMENT_ID,
          },
        });
        console.error(`Failed to process payment: ${ex.message}`);
      }
    }

    res.json({
      status: 200,
      content: {
        dryRun,
        fileFormat,
        postingDate: postingDate?.toISODate(),
        summary: {
          totalParsed: payments.length,
          valid,
          invalid,
          skippedSwish,
          skippedDuplicate,
        },
        validTransactions: dryRun ? validTransactions : undefined,
        invalidTransactions,
      },
    });
  },
);
