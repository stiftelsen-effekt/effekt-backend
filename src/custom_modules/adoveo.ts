import { createHash } from "crypto";
import { DAO } from "./DAO";
import {
  AdoveoFundraiserTransactionReportRow,
  AdoveoGiftCardsTransactionReportRow,
  parseFundraiserReport,
  parseGiftCardsReport,
} from "./parsers/adoveo";
import { DateTime } from "luxon";
import { Adoveo_fundraiser_transactions, Adoveo_giftcard_transactions } from "@prisma/client";
import { donationHelpers } from "../custom_modules/donationHelpers";
import { sendDonationReceipt } from "./mail";
import { DistributionCauseArea } from "../schemas/types";

enum AdoveoPaymentTypes {
  FUNDRAISER = 13,
  GIFTCARD = 14,
}

export async function processFundraisingReport(report: Buffer, fundraiserId: number) {
  /**
   * Get fundraiser, and shares, and validate the data
   */

  const fundraiser = await DAO.adoveo.getFundraiserByID(fundraiserId);
  if (!fundraiser) {
    throw new Error("Fundraiser not found");
  }
  const shares = await DAO.adoveo.getFundraiserOrgShares(fundraiserId);
  if (!shares.length) {
    throw new Error("Fundraiser has no shares");
  }
  if (shares.reduce((sum, share) => sum + Number(share.Share), 0) !== 100) {
    throw new Error("Shares do not add up to 100");
  }

  /**
   * Parse report
   */
  const data = parseFundraiserReport(report);

  const processResult = {
    addedTransactions: 0,
    updatedTransactions: 0,
    addedDonations: 0,
    failedTransactions: [],
  };

  /**
   * For each transaction, add it to the database
   */
  for (let row of data) {
    const result = await addFundraiserRecord({
      fundraiserId,
      row,
      split: shares.map((share) => ({ id: share.Org_ID, share: share.Share })),
    });

    if (result.success) {
      processResult.addedTransactions += result.addedTransaction ? 1 : 0;
      processResult.updatedTransactions += result.updatedTransaction ? 1 : 0;
      processResult.addedDonations += result.addedDonation ? 1 : 0;
    } else {
      processResult.failedTransactions.push({ row, reason: result.failedReason });
    }
  }

  return processResult;
}

async function addFundraiserRecord({
  fundraiserId,
  row,
  split,
}: {
  fundraiserId: number;
  row: AdoveoFundraiserTransactionReportRow;
  split: { id: number; share: string }[];
}): Promise<{
  success: boolean;
  addedTransaction: boolean;
  updatedTransaction: boolean;
  addedDonation: boolean;
  failedReason: string;
}> {
  const result = {
    success: false,
    addedTransaction: false,
    updatedTransaction: false,
    addedDonation: false,
    failedReason: "",
  };

  console.log("Processing row", row);

  // To prevent duplicate entries, we check if the transaction already exists
  // We get no unique identifier from Adoveo, so we have to use a hash of the fields
  const hashString = getFundraiserRowHash(row, fundraiserId);

  console.log("Hash", hashString);

  /**
   * There are a couple of scenarios we need to handle:
   *
   * 1. The transaction does not exist, and the status is sale
   * 2. The transaction does not exist, and the status is reserved
   * 3. The transaction already exists, and the status has changed from reserved to sale
   * 4. The transaction already exists with a reserved status, and the report row status is still reserved
   * 5. The transaction already exists with a sale status, and the report row status is still sale
   * 6. The transaction already exists with a sale status, and the report row status is reserved
   *
   * In the first scenario, we add the transaction to the database, and an accompanying donation
   * In the second scenario, we add the transaction to the database, but not an accompanying donation
   * In the third scenario, we update the transaction status in the database and add an accompanying donation
   * In the fourth scenario, we do nothing
   * In the fifth scenario, we double check that the donation exists. If not, we add it.
   * In the sixth scenario, we do nothing
   */

  try {
    const existingTransaction = await DAO.adoveo.getFundraiserTransactionByHash(hashString);
    if (!existingTransaction) {
      /**
       * Scenario 1 and 2
       */
      console.log("Transaction does not exist");

      const newTransaction: Omit<
        Adoveo_fundraiser_transactions,
        "ID" | "Last_updated" | "Created"
      > = {
        Fundraiser_ID: fundraiserId,
        Donation_ID: null,
        Sum: row.amount as any,
        Timestamp: getTimestamp(row),
        Sender_email: row.senderEmail,
        Sender_phone: row.senderPhone,
        Status: row.status,
        Location: row.location,
        Hash: hashString,
      };

      const transactionid = await DAO.adoveo.addFundraiserTransaction(newTransaction);

      result.addedTransaction = true;

      const transaction = await DAO.adoveo.getFundraiserTransactionByID(transactionid);
      console.log("Added transaction", transaction);

      if (row.status === "SALE") {
        /**
         * Scenario 1
         */
        console.log("Status is sale, adding donation");
        const donationId = await addDonation(
          row,
          split,
          transaction.ID,
          AdoveoPaymentTypes.FUNDRAISER,
        );
        await DAO.adoveo.updateFundraiserTransactionDonationID(transaction.ID, donationId);
        result.addedDonation = true;
        result.success = true;
        return result;
      } else {
        /**
         * Scenario 2
         */
        result.success = true;
        return result;
      }
    } else {
      /**
       * Scenario 3, 4, 5 and 6
       */
      console.log("Transaction already exists");

      if (existingTransaction.Status === "RESERVED" && row.status === "SALE") {
        /**
         * Scenario 3
         */
        console.log("Status has changed from reserved to sale, updating transaction");
        await DAO.adoveo.updateFundraiserTransactionStatus(existingTransaction.ID, row.status);
        const donationid = await addDonation(
          row,
          split,
          existingTransaction.ID,
          AdoveoPaymentTypes.FUNDRAISER,
        );
        await DAO.adoveo.updateFundraiserTransactionDonationID(existingTransaction.ID, donationid);
        result.updatedTransaction = true;
        result.addedDonation = true;
        result.success = true;
        return result;
      } else if (existingTransaction.Status === "RESERVED" && row.status === "RESERVED") {
        /**
         * Scenario 4
         */
        console.log("Status is still reserved, doing nothing");
        result.success = true;
        return result;
      } else if (existingTransaction.Status === "SALE" && row.status === "SALE") {
        /**
         * Scenario 5
         */
        if (!existingTransaction.Donation_ID) {
          console.log("Status is still sale, but donation is missing, adding donation");
          const donationId = await addDonation(
            row,
            split,
            existingTransaction.ID,
            AdoveoPaymentTypes.FUNDRAISER,
          );
          await DAO.adoveo.updateFundraiserTransactionDonationID(
            existingTransaction.ID,
            donationId,
          );
          result.updatedTransaction = true;
          result.addedDonation = true;
        } else {
          console.log("Status is still sale, and donation exists, doing nothing");
        }
        result.success = true;
        return result;
      } else if (existingTransaction.Status === "SALE" && row.status === "RESERVED") {
        /**
         * Scenario 6
         */
        console.log("Status has changed from sale to reserved");
        console.warn("Possibly outdated report? Do nothing.");
        result.success = true;
        return result;
      }
    }
  } catch (error) {
    console.error(error);
    result.success = false;
    result.failedReason = error.message;
    return result;
  }
}

export async function processGiftCardsReport(report: Buffer) {
  /**
   * Parse report
   */
  const data = parseGiftCardsReport(report);

  let causeAreas = await DAO.causeareas.getActiveWithOrganizations();
  if (!causeAreas.length) {
    throw new Error("No active cause areas");
  }
  causeAreas = causeAreas
    .filter((causeArea) => causeArea.standardPercentageShare > 0)
    .map((c) => ({ ...c, organizations: c.organizations.filter((o) => o.standardShare > 0) }))
    .map((causeArea) => ({
      ...causeArea,
      organizations: causeArea.organizations.map((organization) => ({
        ...organization,
        standardShare: organization.standardShare / causeArea.standardPercentageShare,
      })),
    }));

  const processResult = {
    addedTransactions: 0,
    updatedTransactions: 0,
    addedDonations: 0,
    failedTransactions: [],
  };

  /**
   * For each transaction, add it to the database
   */
  for (let row of data) {
    const result = await addGiftcardRecord({
      row,
      causeAreas,
    });

    if (result.success) {
      processResult.addedTransactions += result.addedTransaction ? 1 : 0;
      processResult.updatedTransactions += result.updatedTransaction ? 1 : 0;
      processResult.addedDonations += result.addedDonation ? 1 : 0;
    } else {
      processResult.failedTransactions.push({ row, reason: result.failedReason });
    }
  }

  return processResult;
}

async function addGiftcardRecord({
  row,
  causeAreas,
}: {
  row: AdoveoGiftCardsTransactionReportRow;
  causeAreas: DistributionCauseArea[];
}): Promise<{
  success: boolean;
  addedTransaction: boolean;
  updatedTransaction: boolean;
  addedDonation: boolean;
  failedReason: string;
}> {
  const result = {
    success: false,
    addedTransaction: false,
    updatedTransaction: false,
    addedDonation: false,
    failedReason: "",
  };

  console.log("Processing row", row);

  // To prevent duplicate entries, we check if the transaction already exists
  // We get no unique identifier from Adoveo, so we have to use a hash of the fields
  const hashString = getGiftcardRowHash(row);

  console.log("Hash", hashString);

  /**
   * There are a couple of scenarios we need to handle:
   *
   * 1. The transaction does not exist, and the status is sale
   * 2. The transaction does not exist, and the status is reserved
   * 3. The transaction already exists, and the status has changed from reserved to sale
   * 4. The transaction already exists with a reserved status, and the report row status is still reserved
   * 5. The transaction already exists with a sale status, and the report row status is still sale
   * 6. The transaction already exists with a sale status, and the report row status is reserved
   *
   * In the first scenario, we add the transaction to the database, and an accompanying donation
   * In the second scenario, we add the transaction to the database, but not an accompanying donation
   * In the third scenario, we update the transaction status in the database and add an accompanying donation
   * In the fourth scenario, we do nothing
   * In the fifth scenario, we double check that the donation exists. If not, we add it.
   * In the sixth scenario, we do nothing
   */

  try {
    const existingTransaction = await DAO.adoveo.getGiftcardTransactionByHash(hashString);
    if (!existingTransaction) {
      /**
       * Scenario 1 and 2
       */
      console.log("Transaction does not exist");

      const newTransaction: Omit<Adoveo_giftcard_transactions, "ID" | "Last_updated" | "Created"> =
        {
          Sum: row.amount as any,
          Donation_ID: null,
          Timestamp: getTimestamp(row),
          Sender_email: row.senderEmail,
          Sender_phone: row.senderPhone,
          Sender_name: row.senderName,
          Sender_donor_ID: null,
          Receiver_name: row.receiverName,
          Receiver_phone: row.receiverPhone,
          Receiver_donor_ID: null,
          Message: row.message,
          Status: row.status,
          Location: row.location,
          CouponSend: row.couponSend,
          Hash: hashString,
        };

      const transactionid = await DAO.adoveo.addGiftcardTransaction(newTransaction);

      result.addedTransaction = true;

      const transaction = await DAO.adoveo.getGiftcardTransactionByID(transactionid);
      console.log("Added transaction", transaction);

      if (row.status === "SALE") {
        /**
         * Scenario 1
         */
        console.log("Status is sale, adding donation");
        const donationId = await addDonation(
          row,
          causeAreas,
          transaction.ID,
          AdoveoPaymentTypes.GIFTCARD,
        );
        await DAO.adoveo.updateGiftcardTransactionDonationID(transaction.ID, donationId);
        result.addedDonation = true;
        result.success = true;
        return result;
      } else {
        /**
         * Scenario 2
         */
        result.success = true;
        return result;
      }
    } else {
      /**
       * Scenario 3, 4, 5 and 6
       */
      console.log("Transaction already exists");

      if (existingTransaction.Status === "RESERVED" && row.status === "SALE") {
        /**
         * Scenario 3
         */
        console.log("Status has changed from reserved to sale, updating transaction");
        await DAO.adoveo.updateGiftcardTransactionStatus(existingTransaction.ID, row.status);
        const donationid = await addDonation(
          row,
          causeAreas,
          existingTransaction.ID,
          AdoveoPaymentTypes.GIFTCARD,
        );
        await DAO.adoveo.updateGiftcardTransactionDonationID(existingTransaction.ID, donationid);
        result.updatedTransaction = true;
        result.addedDonation = true;
        result.success = true;
        return result;
      } else if (existingTransaction.Status === "RESERVED" && row.status === "RESERVED") {
        /**
         * Scenario 4
         */
        console.log("Status is still reserved, doing nothing");
        result.success = true;
        return result;
      } else if (existingTransaction.Status === "SALE" && row.status === "SALE") {
        /**
         * Scenario 5
         */
        if (!existingTransaction.Donation_ID) {
          console.log("Status is still sale, but donation is missing, adding donation");
          const donationId = await addDonation(
            row,
            causeAreas,
            existingTransaction.ID,
            AdoveoPaymentTypes.GIFTCARD,
          );
          await DAO.adoveo.updateGiftcardTransactionDonationID(existingTransaction.ID, donationId);
          result.updatedTransaction = true;
          result.addedDonation = true;
        } else {
          console.log("Status is still sale, and donation exists, doing nothing");
        }
        result.success = true;
        return result;
      } else if (existingTransaction.Status === "SALE" && row.status === "RESERVED") {
        /**
         * Scenario 6
         */
        console.log("Status has changed from sale to reserved");
        console.warn("Possibly outdated report? Do nothing.");
        result.success = true;
        return result;
      }
    }
  } catch (error) {
    console.error(error);
    result.success = false;
    result.failedReason = error.message;
    return result;
  }
}

async function getDonorId(email: string, name: string) {
  email = email.trim();
  let donorId = await DAO.donors.getIDbyEmail(email);
  if (!donorId) {
    donorId = await DAO.donors.add({
      full_name: name,
      email: email,
    });
  }
  return donorId;
}

async function getDefaultTaxUnitId(donorId: number) {
  const taxUnits = await DAO.tax.getByDonorId(donorId);
  const activeTaxUnits = taxUnits.filter((taxUnit) => taxUnit.archived === null);

  let taxUnitId: number | undefined;
  if (activeTaxUnits.length === 1) {
    console.log("Donor has only one tax unit, using that");
    taxUnitId = activeTaxUnits[0].id;
  }
  return taxUnitId;
}

async function getKID(causeAreas: DistributionCauseArea[], donorId: number, taxUnitId: number) {
  let KID = await DAO.distributions.getKIDbySplit({
    causeAreas,
    donorId,
    taxUnitId,
  });

  if (!KID) {
    console.log("No KID found, creating new one");
    const newKID = await donationHelpers.createKID();
    console.log("New KID", newKID);
    await DAO.distributions.add({
      kid: newKID,
      donorId,
      taxUnitId,
      causeAreas,
    });
    KID = newKID;
  }

  return KID;
}

async function addDonation(
  row: AdoveoFundraiserTransactionReportRow | AdoveoGiftCardsTransactionReportRow,
  causeAreas: DistributionCauseArea[],
  transactionId: number,
  paymentType: AdoveoPaymentTypes,
) {
  // Get or create donor
  const donorId = await getDonorId(row.senderEmail, row.senderName);

  // If donor has only one tax unit, use that
  const taxUnitId = await getDefaultTaxUnitId(donorId);

  // Get or create KID
  const KID = await getKID(causeAreas, donorId, taxUnitId);

  const donationId = await DAO.donations.add(
    KID,
    paymentType,
    row.amount,
    getTimestamp(row),
    `ad.${paymentType === AdoveoPaymentTypes.FUNDRAISER ? "fnd" : "gft"}-${transactionId}`,
  );

  try {
    await sendDonationReceipt(donationId);
  } catch (error) {
    console.error("Failed to send donation receipt for " + donationId);
    console.error(error);
  }

  return donationId;
}

function getTimestamp(row: AdoveoFundraiserTransactionReportRow) {
  const formattedTimestamp = DateTime.fromFormat(row.date, "yyyy-MM-dd HH:mm:ss");
  if (!formattedTimestamp.isValid) {
    throw new Error("Invalid date format");
  }
  return formattedTimestamp.toJSDate();
}

function getFundraiserRowHash(row: AdoveoFundraiserTransactionReportRow, fundraiserId: number) {
  const hash = createHash("md5");
  hash.update(`fundraiser-${fundraiserId}`);
  hash.update(row.date);
  hash.update(row.senderName);
  hash.update(row.senderEmail);
  hash.update(row.senderPhone);
  hash.update(row.amount);
  return hash.digest("hex");
}

function getGiftcardRowHash(row: AdoveoGiftCardsTransactionReportRow) {
  const hash = createHash("md5");
  hash.update(`giftcard`);
  hash.update(row.date);
  hash.update(row.senderName);
  hash.update(row.senderEmail);
  hash.update(row.senderPhone);
  hash.update(row.receiverName);
  hash.update(row.receiverPhone);
  hash.update(row.amount);
  return hash.digest("hex");
}
