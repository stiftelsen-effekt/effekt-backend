import iconv from "iconv-lite";
/**
 * Processing of uploaded payment report files. Shared by the REST routes in
 * routes/reports/* and the tRPC procedures in trpc/routers/reports.ts.
 *
 * The returned objects are serialised as-is by the REST routes, so their shapes are part of the
 * REST contract (`content` of POST /reports/{ocr,vipps,bank/no,bank/se,facebook,autogiro}).
 */
import { Prisma } from "@prisma/client";
import chardet from "chardet";
import { createHash } from "crypto";
import { DateTime } from "luxon";
import type { Moment } from "moment";
import { processAutogiroInputFile } from "./autogiro";
import { AutoGiroParser } from "./parsers/autogiro";
import { DAO } from "./DAO";
import { VippsParsingRule } from "./DAO_modules/parsing";
import { sendDonationReceipt } from "./mail";
import { AutoGiroContent } from "./parsers/autogiro";
import {
  AutoGiroMandateCommentaryCodes,
  AutoGiroMandateInformationCodes,
} from "./parsers/autogiro/mandates";
import { parseReport as parseBankReport } from "./parsers/bank";
import { isCamtXml, parseCamtFile } from "./parsers/camtParser";
import { parseReport as parseFacebookReport } from "./parsers/facebook";
import { parseTotalInFile, RecordType } from "./parsers/sebank";
import { parseReport as parseVippsReport, VippsTransaction } from "./parsers/vipps";
import payment from "../enums/paymentMethods";

const config = require("../config");
const OCRparser = require("./parsers/OCR.js");
const ocr = require("./ocr");

const BANK_NO_KID_ID = 5;
const BANK_SE_PAYMENT_ID = 2;
const SWISH_PAYMENT_ID = 11;

/**
 * The uploaded file could not be read as the expected report type. Thrown before anything is
 * written. Carries `status`/`msg` so the REST error handler answers 400 with the message.
 */
export class ReportParseError extends Error {
  readonly status = 400;
  readonly msg: string;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReportParseError";
    this.msg = message;
  }
}

/** Runs a parser, turning any exception into a ReportParseError with the given prefix */
function parseOrThrow<T>(description: string, parse: () => T): T {
  try {
    return parse();
  } catch (ex) {
    if (ex instanceof ReportParseError) throw ex;
    throw new ReportParseError(`${description}: ${(ex as Error).message}`, { cause: ex });
  }
}

export type InvalidTransaction<T> = { reason: string; transaction: T };

export type ReportUploadResult<T> = {
  valid: number;
  invalid: number;
  invalidTransactions: InvalidTransaction<T>[];
};

//region OCR

/** Transaction as produced by parsers/OCR.js */
export type OcrTransaction = {
  transactionCode: number;
  number: string;
  date: Date;
  amount: number;
  KID: string;
  transactionID: string;
  paymentMethod: number;
};

/**
 * Parses an OCR file (Nets) and adds the donations. `ignored` counts donations that already
 * existed; `invalid` counts failed transactions, all of which are listed in `invalidTransactions`.
 */
export async function processOcrReport(
  data: string,
  metaOwnerID: number | null,
): Promise<ReportUploadResult<OcrTransaction> & { ignored: number }> {
  const transactions: OcrTransaction[] = OCRparser.parse(data);
  return ocr.addDonations(transactions, metaOwnerID);
}

//endregion

//region Vipps

export type VippsReviewTransaction = VippsTransaction & { paymentID: number };

export async function processVippsReport(
  report: Buffer,
  metaOwnerID: number | null,
): Promise<ReportUploadResult<VippsReviewTransaction>> {
  const parsedReport = parseOrThrow("Could not read the Vipps report", () =>
    parseVippsReport(report),
  );
  const parsingRules = await DAO.parsing.getVippsParsingRules(
    parsedReport.minDate,
    parsedReport.maxDate,
  );

  const transactions = parsedReport.transactions;
  const invalidTransactions: InvalidTransaction<VippsReviewTransaction>[] = [];
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
              Sender_email: donor!.email,
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

  return { valid, invalid, invalidTransactions };
}

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

//endregion

//region Bank NO

/** Transaction as produced by parsers/bank.ts */
export type BankNoTransaction = {
  date: Moment;
  message: string;
  amount: number;
  KID: number | null;
  transactionID: string;
  paymentID: number;
};

export async function processBankNoReport(
  data: string,
  metaOwnerID: number | null,
): Promise<ReportUploadResult<BankNoTransaction>> {
  const transactions: BankNoTransaction[] | false = parseOrThrow(
    "Could not read the bank report",
    () => parseBankReport(data),
  );
  if (!transactions) throw new ReportParseError("Could not read the bank report as CSV");

  let valid = 0;
  let invalid = 0;
  const invalidTransactions: InvalidTransaction<BankNoTransaction>[] = [];
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
    } else {
      invalidTransactions.push({
        reason: "Could not find valid KID or matching parsing rule",
        transaction: transaction,
      });
      invalid++;
    }
  }

  return { valid, invalid, invalidTransactions };
}

//endregion

//region Bank SE

export type BankSeTransaction = {
  date: DateTime | undefined;
  message: string;
  amount: number;
  KID?: string;
  transactionID: string;
  donorName?: string;
  paymentID: number;
};

export type BankSeDryRunTransaction = {
  KID: string | undefined;
  amount: number;
  transactionID: string;
  donorName: string | undefined;
  date: DateTime | undefined;
  message: string;
};

export type BankSeReportResult = ReportUploadResult<BankSeTransaction> &
  (
    | { dryRun?: undefined }
    | {
        dryRun: true;
        fileFormat: "xml" | "totalin";
        postingDate: string | null | undefined;
        totalParsed: number;
        skippedSwish: number;
        skippedDuplicate: number;
        validTransactions: BankSeDryRunTransaction[];
      }
  );

/**
 * Processes a Swedish bank file (ISO 20022 CAMT.053 XML or fixed-width TotalIn). In dry run mode
 * nothing is written and the would-be donations are returned in `validTransactions`.
 */
export async function processBankSeReport(
  data: string,
  dryRun: boolean,
  metaOwnerID: number | null = null,
): Promise<BankSeReportResult> {
  // Auto-detect format and parse
  let payments: {
    amount: number;
    externalReference: string;
    messages: string[];
    KID?: string;
    donorName?: string;
  }[] = [];
  let postingDate: DateTime | undefined;
  let fileFormat: "xml" | "totalin";

  if (isCamtXml(data)) {
    fileFormat = "xml";
    // Parse ISO 20022 CAMT.053 XML format
    const result = parseOrThrow("Could not read the CAMT.053 file", () => parseCamtFile(data));
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
    const accountStart = records.find(
      (record) => record.recordType === RecordType.AccountAndCurrencyStartRecord,
    );
    if (
      !data.trimStart().startsWith(RecordType.OpeningRecord) ||
      !accountStart ||
      !DateTime.fromFormat(accountStart.postingDate, "yyyyMMdd").isValid
    ) {
      throw new ReportParseError("Not a CAMT.053 XML or TotalIn file");
    }
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
        if (payments.length === 0) {
          throw new ReportParseError("Invalid TotalIn file: message record before any payment");
        }
        // Add messages to last payment
        payments[payments.length - 1].messages.push(record.messages[0]);
        payments[payments.length - 1].messages.push(record.messages[1]);
      }
    }
  }

  let valid = 0;
  let invalid = 0;
  let skippedSwish = 0;
  let skippedDuplicate = 0;
  const invalidTransactions: InvalidTransaction<BankSeTransaction>[] = [];
  const validTransactions: BankSeDryRunTransaction[] = []; // For dry run reporting

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
        const donationID = await DAO.donations.add(
          payment.KID,
          BANK_SE_PAYMENT_ID,
          payment.amount / 100,
          postingDate!.toJSDate(),
          payment.externalReference,
          metaOwnerID,
        );

        try {
          if (config.env === "production") {
            await sendDonationReceipt(donationID);
          }
        } catch (ex) {
          console.error("Failed to send donation reciept");
          console.error(ex);
        }
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

  if (!dryRun) return { valid, invalid, invalidTransactions };

  return {
    // Required fields for admin panel compatibility
    valid,
    invalid,
    invalidTransactions,
    // Additional dry run info
    dryRun: true,
    fileFormat,
    postingDate: postingDate?.toISODate(),
    totalParsed: payments.length,
    skippedSwish,
    skippedDuplicate,
    validTransactions,
  };
}

//endregion

//region Facebook

export type FacebookCampaignMissingShares = {
  ID: string;
  fundraiserTitle: string;
  campaignOwnerName: string;
  permalink: string;
};

/**
 * Stores a Facebook payout report, registers unknown campaigns and returns the campaigns that
 * have no organization shares registered yet.
 */
export async function processFacebookReport(
  report: Buffer,
): Promise<{ fbCampaigns: FacebookCampaignMissingShares[] }> {
  // Parse before removing the stored reports, so a broken file doesn't wipe them
  const donations = await parseFacebookReport(report);
  if (!donations) {
    throw new ReportParseError(
      "Could not read the Facebook payout report (or fetch exchange rates from Norges Bank)",
    );
  }
  await DAO.facebook.removeAllFacebookReports();
  await DAO.facebook.registerFacebookReport(JSON.stringify(donations));

  const campaigns = donations.reduce((acc, donation) => {
    let campaign_ID = donation["Campaign ID"];

    if (!acc.some((e) => e.ID == campaign_ID)) {
      acc.push({
        ID: campaign_ID,
        Fundraiser_title: donation["Fundraiser title"],
        Campaign_owner_name: donation["Campaign owner name"],
        Permalink: donation.Permalink,
        Source_name: donation["Source name"],
        Fundraiser_type: donation["Fundraiser type"],
      });
    }
    return acc;
  }, []);

  let registeredCampaignIDs = await DAO.facebook.getAllFacebookCampaignIDs();
  registeredCampaignIDs = Object.values(registeredCampaignIDs);
  registeredCampaignIDs = registeredCampaignIDs.reduce((acc, dictID) => {
    acc.push(dictID.ID);
    return acc;
  }, []);

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    const campaignID = campaign.ID;

    if (!registeredCampaignIDs.includes(campaignID)) {
      await DAO.facebook.registerFacebookCampaign(
        campaignID,
        campaign.Fundraiser_title,
        campaign.Source_name,
        campaign.Permalink,
        campaign.Campaign_owner_name,
        campaign.Fundraiser_type,
      );
    }
  }

  // Check if campaign has stored shares and send to admin panel if not
  const campaignsWithMissingShares: FacebookCampaignMissingShares[] = [];
  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    if ((await DAO.facebook.isCampaignRegistered(campaign.ID)) == false) {
      campaignsWithMissingShares.push({
        ID: campaign.ID,
        fundraiserTitle: campaign.Fundraiser_title,
        campaignOwnerName: campaign.Campaign_owner_name,
        permalink: campaign.Permalink,
      });
    }
  }

  return { fbCampaigns: campaignsWithMissingShares };
}

//endregion

//region AutoGiro

export type AutogiroPaymentsResult = {
  valid: number;
  invalid: number;
  invalidTransactions: {
    reason: string | undefined;
    transaction: {
      KID: string;
      transactionID: string;
      paymentID: number;
      /** In öre, unlike the registered donation sum */
      amount: number;
      date: Date;
    };
  }[];
};

export type AutogiroMandatesResult = {
  confirmed: number;
  cancelled: number;
  invalid: number;
  rejected: number;
  invalidMandates: {
    KID: string;
    informationCode: AutoGiroMandateInformationCodes;
    commentaryCode: AutoGiroMandateCommentaryCodes;
    message: unknown;
  }[];
};

export type AutogiroRejectedChargesResult = {
  rejectedCharges: number;
  failedRejectedCharges: number;
};

export type AutogiroReportResult =
  | ({ type: "payments" } & AutogiroPaymentsResult)
  | { type: "eMandates"; newMandates: number }
  | ({ type: "mandates" } & AutogiroMandatesResult)
  | ({ type: "rejectedCharges" } & AutogiroRejectedChargesResult)
  | { type: "unhandled"; fileType: string };

/**
 * Detects the encoding of an AutoGiro file from Bankgirot and processes it according to its
 * content type (payments, mandates, e-mandates, rejected charges).
 */
export async function processAutogiroReport(report: Buffer): Promise<AutogiroReportResult> {
  // processAutogiroInputFile parses again; this separates unreadable files from failures while
  // processing
  const data = parseOrThrow("Could not read the AutoGiro file", () => {
    const decoded = decodeReport(report);
    AutoGiroParser.parse(decoded);
    return decoded;
  });

  const result = await processAutogiroInputFile(data);
  const fileType = result.openingRecord.fileContents;

  if (fileType === AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP) {
    if (!("results" in result)) throw new Error("Missing results in return object");
    const { valid, invalid, invalidTransactions } = result.results;
    return {
      type: "payments",
      valid: valid!,
      invalid: invalid!,
      invalidTransactions: invalidTransactions!,
    };
  } else if (fileType === AutoGiroContent.E_MANDATES) {
    if (!("emandates" in result)) throw new Error("Missing mandates in e-mandates file");
    return { type: "eMandates", newMandates: result.emandates.length };
  } else if (fileType === AutoGiroContent.REJECTED_CHARGES) {
    if (!("results" in result)) throw new Error("Missing results in return object");
    const { rejectedCharges, failedRejectedCharges } = result.results;
    return {
      type: "rejectedCharges",
      rejectedCharges: rejectedCharges!,
      failedRejectedCharges: failedRejectedCharges!,
    };
  } else if (fileType === AutoGiroContent.MANDATES) {
    if (!("results" in result)) throw new Error("Missing results in return object");
    const { confirmed, cancelled, invalid, rejected, invalidMandates } = result.results;
    return {
      type: "mandates",
      confirmed: confirmed!,
      cancelled: cancelled!,
      invalid: invalid!,
      rejected: rejected!,
      invalidMandates: invalidMandates!,
    };
  }
  /**
   * TODO: Handle other file types
   */
  return { type: "unhandled", fileType };
}

/**
 * Decodes a report with the encoding chardet detects. iconv-lite knows the single-byte encodings
 * (windows-1252, ISO-8859-x) that Buffer.toString doesn't; Bankgirot files are Latin-1 if unsure.
 */
function decodeReport(report: Buffer): string {
  const encoding = chardet.detect(report);
  return encoding && iconv.encodingExists(encoding)
    ? iconv.decode(report, encoding)
    : report.toString("latin1");
}

//endregion
