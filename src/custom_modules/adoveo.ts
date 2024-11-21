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
import { DistributionCauseArea, DistributionInput } from "../schemas/types";
import { mapPureOrgSharesToDistributionInputCauseAreas } from "./mapping";

enum AdoveoPaymentTypes {
  FUNDRAISER = 13,
  GIFTCARD = 14,
}

export async function processFundraisingReport(report: Buffer, fundraiserId: number) {
  /**
   * Parse report
   */
  const data = parseFundraiserReport(report);

  return processFundraisingTransactions(data, fundraiserId);
}

export async function processFundraisingCrawler(token: string) {
  const campaigns = await fetchAdoveoCampaigns(token);

  for (const campaign of campaigns) {
    const dbFundraiser = await DAO.adoveo.getFundraiserByAdoveoID(campaign.adoveoId);

    if (!dbFundraiser) {
      console.error(`Missing fundraiser for campaign ${campaign.adoveoId}`);
      continue;
    }

    let lastImport: DateTime;
    if (!dbFundraiser.Last_import) {
      lastImport = DateTime.fromISO("2019-01-01");
    } else {
      lastImport = DateTime.fromJSDate(dbFundraiser.Last_import);
    }
    console.log(
      `Last import for fundraiser ${dbFundraiser.ID} (${
        dbFundraiser.Name
      }): ${lastImport.toISODate()}`,
    );
    const transactions = await fetchAdoveoTransactions(token, campaign.adoveoId, lastImport);

    console.log(
      `Processing ${transactions.length} transactions for fundraiser ${dbFundraiser.ID} (${dbFundraiser.Name})`,
    );
    await processFundraisingTransactions(transactions, dbFundraiser.ID);

    await DAO.adoveo.updateFundraiserLastImport(dbFundraiser.ID, DateTime.now());
  }
}

export async function processFundraisingTransactions(
  data: AdoveoFundraiserTransactionReportRow[],
  fundraiserId: number,
) {
  /**
   * Get fundraiser, and shares, and validate the data
   */
  const fundraiser = await DAO.adoveo.getFundraiserByID(fundraiserId);
  if (!fundraiser) {
    throw new Error("Fundraiser not found");
  }
  const shares = await DAO.adoveo.getFundraiserOrgShares(fundraiserId);

  const causeAreasInput = await mapPureOrgSharesToDistributionInputCauseAreas(
    shares.map((s) => ({ orgId: s.Org_ID, percentageShare: parseFloat(s.Share) })),
  );

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
      causeAreas: causeAreasInput,
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
  causeAreas,
}: {
  fundraiserId: number;
  row: AdoveoFundraiserTransactionReportRow;
  causeAreas: DistributionInput["causeAreas"];
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
          causeAreas,
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
          causeAreas,
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
            causeAreas,
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

export async function processGiftCardsReport(report: Buffer, giftcardId: number) {
  /**
   * Get giftcard and shares, and validate the data
   */
  const giftcard = await DAO.adoveo.getGiftcardByID(giftcardId);
  if (!giftcard) {
    throw new Error("Giftcard not found");
  }
  const shares = await DAO.adoveo.getGiftcardOrgShares(giftcardId);

  const causeAreasInput = await mapPureOrgSharesToDistributionInputCauseAreas(
    shares.map((s) => ({ orgId: s.Org_ID, percentageShare: parseFloat(s.Share) })),
  );

  /**
   * Parse report
   */
  const data = parseGiftCardsReport(report);

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
      giftcardId,
      row,
      causeAreas: causeAreasInput,
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
  giftcardId,
  row,
  causeAreas,
}: {
  giftcardId: number;
  row: AdoveoGiftCardsTransactionReportRow;
  causeAreas: DistributionInput["causeAreas"];
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
      console.log("Transaction does not exist");

      const newTransaction: Omit<Adoveo_giftcard_transactions, "ID" | "Last_updated" | "Created"> =
        {
          Giftcard_ID: giftcardId, // Add the giftcard ID
          Donation_ID: null,
          Sum: row.amount as any,
          Timestamp: getTimestamp(row),
          Sender_donor_ID: null,
          Sender_email: row.senderEmail,
          Sender_phone: row.senderPhone,
          Sender_name: row.senderName,
          Receiver_donor_ID: null,
          Receiver_name: row.receiverName,
          Receiver_phone: row.receiverPhone,
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

async function fetchAdoveoCampaigns(token: string) {
  const CAMPAIGN_FOLDER = "Innsamlinger";

  const options = {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      authorization: `Bearer ${token}`,
      origin: "https://manager.adoveo.com",
      priority: "u=1, i",
      referer: "https://manager.adoveo.com/",
      "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "x-data-profile": "gieffektivt",
    },
  };

  const result = await fetch(
    `https://api.adoveo.com/api/v0/campaign?Campaign_limit=50&Campaign_order=Campaign.modified%20IS%20NULL%2C%20Campaign.modified%20DESC%2C%20Campaign.created%20DESC%2C%20Campaign.info%20${encodeURIComponent(
      CAMPAIGN_FOLDER,
    )}&Campaign_page=1`,
    options,
  );

  const json = (await result.json()) as AdoveoResponseCampaignResponse;

  return json.items.map((campaign) => ({
    adoveoId: campaign.id,
    name: campaign.item_label,
  }));
}

async function fetchAdoveoTransactions(token: string, adoveoId: number, lastImport: DateTime) {
  const options = {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      authorization: `Bearer ${token}`,
      "content-type": "application/json;charset=UTF-8",
      origin: "https://manager.adoveo.com",
      priority: "u=1, i",
      referer: "https://manager.adoveo.com/",
      "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "x-data-profile": "gieffektivt",
    },
    body: '{"$promise":{},"$resolved":false}',
  };

  const result = await fetch(
    `https://api.adoveo.com/api/v0/campaign/${adoveoId}?fromDate=${lastImport.toISODate()}&participant=1&show_all_participants=false&toDate=${DateTime.now().toISODate()}`,
    options,
  );

  const json = (await result.json()) as AdoveoResponse;

  const mapped = json.data
    .filter((transaction) => transaction.Status === "SALE" || transaction.Status === "RESERVED")
    .map<AdoveoFundraiserTransactionReportRow>((transaction) => ({
      date: transaction.Created,
      senderName: transaction.Name,
      senderEmail: transaction.Email || "adoveo+unknown@gieffektivt.no",
      senderPhone: transaction.Telephone,
      amount: transaction.Amount,
      status: transaction.Status as "SALE" | "RESERVED",
      location: transaction.Location,
    }));

  return mapped;
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
  const taxUnits = await DAO.tax.getActiveTaxUnitIdsByDonorId(donorId);

  let taxUnitId: number | undefined;
  if (taxUnits.length === 1) {
    console.log("Donor has only one tax unit, using that");
    taxUnitId = taxUnits[0].id;
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
  causeAreas: DistributionInput["causeAreas"],
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
    //await sendDonationReceipt(donationId);
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

/**
 * Generated Adoveo JSON api responses
 */
type AdoveoResponseFileMedia = {
  id: number | null;
  node_id: number | null;
  item_type: string;
  item_label: string;
  path: string | null;
  absolute_url: string | null;
  filename: string | null;
  size: number | null;
  created: string | null;
  remote_absolute_url: string | null;
  remote_created: string | null;
  remote_public_created: string | null;
};

type AdoveoResponseCampaignThemeConfiguration = {
  id: string;
  item_type: string;
  item_label: string;
  attributes: {
    campaign_landing_site_background_color: string;
    playerFlowBackgroundImageMedia: AdoveoResponseFileMedia;
  };
};

type AdoveoResponseCampaignFlowCopy = {
  id: string;
  item_type: string;
  item_label: string;
  attributes: {
    email_sms_send_date: string | null;
  };
};

type AdoveoResponseFlowMode = {
  id: string;
  item_type: string;
  item_label: string;
};

type AdoveoResponseCampaign = {
  id: number;
  item_type: string;
  item_label: string;
  attributes: {
    id: number;
    campaign_live_enabled: boolean;
    registration_age_field_is_required: boolean | null;
    flowMode: AdoveoResponseFlowMode;
    campaignFlowCopy: AdoveoResponseCampaignFlowCopy;
    campaignThemeConfiguration: AdoveoResponseCampaignThemeConfiguration;
  };
};

type AdoveoResponseMetaAttribute = {
  id: number;
  name: string;
  campaign_count: number;
};

type AdoveoResponseResponseMeta = {
  totalCount: number;
  pageCount: number;
  getFirstIndex: number;
  getLastIndex: number;
  currentPage: number;
  perPage: number;
  attributes: AdoveoResponseMetaAttribute[];
  live_campaigns: any[];
  0: {
    time_taken: number;
  };
};

type AdoveoResponseCampaignResponse = {
  items: AdoveoResponseCampaign[];
  _meta: AdoveoResponseResponseMeta;
};

type AdoveoResponseLocation = {
  id: number;
  view_key: string;
  view_r: string | null;
  banner_id: number;
};

type AdoveoResponseFormData = {
  Id: number;
  PaymentSystemsId: number | null;
  CouponSystemId: number | null;
  PageId: number;
  PositionId: number | null;
  ShowSenderName: boolean;
  ShowSenderEmail: boolean;
  ShowSenderPhone: boolean;
  ShowSenderMessage: boolean;
  ShowReceiverName: boolean;
  ShowReceiverEmail: boolean;
  ShowReceiverPhone: boolean;
  ShowReceiverMessage: boolean;
  ShowReceiverAddress: boolean;
  SenderName: string | null;
  SenderEmail: string | null;
  SenderPhone: string | null;
  SenderMessage: string | null;
  ReceiverName: string | null;
  ReceiverEmail: string | null;
  ReceiverPhone: string | null;
  ReceiverAddress: string | null;
  ReceiverMessage: string | null;
  SenderNamePlaceholder: string;
  SenderEmailPlaceholder: string;
  SenderPhonePlaceholder: string;
  SenderMessagePlaceholder: string | null;
  ReceiverNamePlaceholder: string;
  ReceiverEmailPlaceholder: string;
  ReceiverPhonePlaceholder: string;
  ReceiverAddressPlaceholder: string;
  ReceiverMessagePlaceholder: string;
  SenderEmailTemplate: string | null;
  Created: string;
  Modified: string;
  SenderSmsTemplate: string | null;
  ReceiverEmailTemplate: string | null;
  ReceiverSmsTemplate: string | null;
  EmailSenderName: string | null;
  EmailType: string | null;
  EmailTypeConformationText: string | null;
  CampaignId: number | null;
  NicknameEnabled: boolean | null;
  NicknamePlaceholder: string | null;
  ShowDatetime: boolean;
  SendDatettimePlaceholder: string | null;
  ShowSenderPersonalNumber: boolean;
  SenderPersonalNumberPlaceholder: string | null;
  ShowReceiverPersonalNumber: boolean;
  ReceiverPersonalNumberPlaceholder: string | null;
  ShowSenderFeedback: boolean;
  SenderFeedbackPlaceholder: string | null;
  ShowReceiverFeedback: boolean;
  ReceiverFeedbackPlaceholder: string | null;
  IsOnlySenderPhoneEnabled: boolean;
  ShowSenderFeedbackRating: boolean;
  SenderFeedbackLabel: string | null;
  ShowReceiverFeedbackRating: boolean;
  ReceiverFeedbackLabel: string | null;
  ReceiverFeedbackRatingLabel: boolean;
  SenderNameRequried: boolean;
  SenderNameError: string | null;
  SenderEmailRequried: boolean;
  SenderEmailError: string | null;
  SenderPhoneRequried: boolean;
  SenderPhoneError: string | null;
  SenderPersonalNumberRequried: boolean;
  SenderPersonalNumberError: string | null;
  ReceiverNameRequried: boolean;
  ReceiverNameError: string | null;
  ReceiverEmailRequried: boolean;
  ReceiverEmailError: string | null;
  ReceiverPhoneRequried: boolean;
  ReceiverPhoneError: string | null;
  ReceiverPersonalNumberRequried: boolean;
  ReceiverPersonalNumberError: string | null;
  ReceiverMessageRequried: boolean;
  ReceiverMessageError: string | null;
  ShowReceiverTown: boolean;
  ReceiverTownRequried: boolean;
  ReceiverTownError: string | null;
  ShowSenderPostalcode: boolean;
  SenderPostalcodeRequried: boolean;
  SenderPostalcodeError: string | null;
  ShowSenderTown: boolean;
  SenderTownRequried: boolean;
  SenderTownError: string | null;
  ShowSenderAddress: boolean;
  SenderAddressRequried: boolean;
  SenderAddressError: string | null;
};

type AdoveoResponseData = {
  Id: number;
  Name: string;
  Age: number | null;
  Acceptmail: number;
  Email: string | null;
  Address: string | null;
  Postalcode: string | null;
  City: string | null;
  Telephone: string;
  Gender: string;
  PersonalNumber: string | null;
  SenderCouponCode: string | null;
  SenderCouponOpened: boolean;
  SenderCouponSentTime: string | null;
  SenderCouponUsed: boolean;
  SenderCouponLandingUrl: string;
  SenderCouponCookieConsent: boolean;
  SenderCouponCookieType: string | null;
  SenderCouponCookieConsentTime: string | null;
  Feedback: string | null;
  CustomField1: string;
  CustomField2: string | null;
  CustomField3: string | null;
  CustomField4: string | null;
  CustomField5: string | null;
  Host: string | null;
  Fbid: string | null;
  FormId: string | null;
  PageId: string | null;
  CampaignId: number;
  ProductId: string | null;
  Created: string;
  Modified: string;
  ReceiverName: string | null;
  ReceiverEmail: string | null;
  ReceiverPhone: string | null;
  ReceiverAddress: string | null;
  Message: string | null;
  ReceiverPersonalNumber: string | null;
  ReceiverCouponCookieConsent: boolean;
  ReceiverCouponCookieType: string | null;
  ReceiverCouponCookieConsentTime: string | null;
  TransactionId: string;
  Amount: string;
  ViewKey: string;
  Status: string;
  Url: string | null;
  ErrorMessage: string | null;
  Token: string;
  CouponSend: boolean;
  CouponCode: string | null;
  CouponOpened: boolean;
  CouponSentTime: string | null;
  CouponLandingUrl: string | null;
  FormPageShowed: boolean;
  EndpageShowed: boolean;
  SwishId: string | null;
  AgreeDownloadReport: boolean;
  ReportDownloadEmail: string | null;
  CouponSendDatetime: string | null;
  Nickname: string | null;
  PointsScored: string | null;
  Location: string;
  GameType: string | null;
  RecurringHistory: string;
  CurrentPoints: string | null;
  Nick: string | null;
  Password: string | null;
  CookieConsent: boolean;
  CookieType: string | null;
  CookieConsentTime: string | null;
  TimeSpent: number;
  CustomTimestamp1: string | null;
  CustomTimestamp2: string | null;
  CustomTimestamp3: string | null;
  CustomTimestamp4: string | null;
  CustomTimestamp5: string | null;
  CustomText1: string;
  CustomText2: string;
  CustomText3: string;
  CustomText4: string | null;
  CustomText5: string;
  CustomText6: string | null;
  CustomText7: string | null;
  CustomText8: string | null;
  CustomText9: string | null;
  CustomText10: string | null;
  IsRegistered: boolean;
  Switch1Enabled: boolean;
  Switch2Enabled: boolean;
  Switch3Enabled: boolean;
  Switch4Enabled: boolean;
  Switch5Enabled: boolean;
  CouponOpenedTime: string | null;
  SenderCouponOpenedTime: string | null;
  SmsParts: string | null;
  SmsCost: string | null;
  location: string;
  CouponLink: string | null;
};

type AdoveoResponse = {
  data: AdoveoResponseData[];
  form_data: AdoveoResponseFormData;
  csv_data: any | null;
  last_page_index: number;
  scheduled_coupons_count: number;
  scheduled_coupons_sent: number;
  unfinished_transactions: number;
  locations: AdoveoResponseLocation[];
  showAttempts: boolean;
  questions_count: number;
  p2p_participants: any | null;
  progressbar_goal: any | null;
};
