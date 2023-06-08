import { DAO } from "../DAO";
import paymentMethodIDs from "../../enums/paymentMethods";

export type RegisteredFacebookDonation = {
  donorID: number;
  paymentID: string;
  taxUnitID: number;
};

//region Get

async function getAllFacebookDonations() {
  let [results] = await DAO.query(`
            SELECT PaymentExternal_ID, sum_confirmed, timestamp_confirmed
            FROM Donations
            WHERE Payment_ID = ${paymentMethodIDs.facebook}`);

  return results;
}

async function getAllFacebookCampaignIDs() {
  let [results] = await DAO.query(`
            SELECT ID
            FROM FB_campaigns`);

  return results;
}

async function getFacebookReports() {
  let [results] = await DAO.query(`
            SELECT FB_report
            FROM FB_donation_reports`);

  return results;
}

async function getFacebookCampaignOrgShares(ID) {
  let [results] = await DAO.query(
    `
            SELECT FB_campaign_ID, Org_ID, Share
            FROM FB_campaign_org_shares
            WHERE FB_campaign_ID = ?
            `,
    [ID],
  );

  return results;
}

/***
 * Fetches a registered facebooks donation, used to associate a payment ID with a tax unit
 * @param {String} paymentID
 * @returns {Number | null} The ID of the tax unit associated with the paymentID
 */
async function getRegisteredFacebookDonation(
  paymentID: string,
): Promise<RegisteredFacebookDonation | null> {
  let [results] = await DAO.query(
    `
              SELECT donorID, paymentID, taxUnitID
              FROM FB_payment_ID
              WHERE paymentID = ?
              `,
    [paymentID],
  );

  if (results.length > 0) {
    return {
      donorID: results[0].donorID,
      paymentID: results[0].paymentID,
      taxUnitID: results[0].taxUnitID,
    };
  } else {
    return null;
  }
}

/**
 * Returns a list of all registered facebook donations by a donor, and groups them by donor id and tax unit
 * @param donorID
 * @returns {Array<{ donorID: number, taxUnitID: number }>}
 */
async function getRegistededFacebookDonationByDonorID(
  donorID,
): Promise<Array<{ donorID: number; taxUnitID: number }>> {
  let [results] = await DAO.query(
    `
            SELECT donorID, taxUnitID
            FROM FB_payment_ID
            WHERE donorID = ?
            GROUP BY donorID, taxUnitID
            `,
    [donorID],
  );

  return results;
}

async function isCampaignRegistered(ID) {
  let [results] = await DAO.query(
    `
            SELECT FB_campaign_ID
            FROM FB_campaign_org_shares
            WHERE FB_campaign_ID = ?
            LIMIT 1
            `,
    [ID],
  );

  return results.length > 0;
}

//region Add

/***
 * Registers a facebook payment ID and associates it with a donor and tax unit
 * @param {Number} donorID
 * @param {String} paymentID
 * @param {Number} taxUnitID
 * @returns {Boolean} True if successful
 */
async function registerPaymentFB(donorID: number, paymentID: string, taxUnitID: number) {
  await DAO.query(
    `
            INSERT INTO FB_payment_ID (donorID, paymentID, taxUnitID)
            VALUES (?, ?, ?)`,
    [donorID, paymentID, taxUnitID],
  );

  return true;
}

async function registerFacebookCampaign(
  ID,
  Fundraiser_title,
  Source_name,
  Permalink,
  Campaign_owner_name,
  Fundraiser_type,
) {
  await DAO.query(
    `
            INSERT INTO FB_campaigns (ID, Fundraiser_title, Source_name, Permalink, Campaign_owner_name, Fundraiser_type)
            VALUES (?, ?, ?, ?, ?, ?)`,
    [ID, Fundraiser_title, Source_name, Permalink, Campaign_owner_name, Fundraiser_type],
  );

  return true;
}

async function registerFacebookReport(report) {
  await DAO.query(
    `
            INSERT INTO FB_donation_reports (FB_report)
            VALUES (?)`,
    [report],
  );

  return true;
}

async function registerFacebookCampaignOrgShare(campaignID, orgID, share, standardSplit) {
  await DAO.query(
    `
            INSERT INTO FB_campaign_org_shares (FB_campaign_ID, Org_ID, Share, Standard_split)
            VALUES (?, ?, ?, ?)`,
    [campaignID, orgID, share, standardSplit],
  );

  return true;
}

//region Delete

async function removeAllFacebookReports() {
  await DAO.query(`
            DELETE FROM FB_donation_reports`);

  return true;
}

//endregion

export const facebook = {
  getAllFacebookDonations,
  registerPaymentFB,
  getAllFacebookCampaignIDs,
  registerFacebookCampaign,
  getFacebookReports,
  getFacebookCampaignOrgShares,
  getRegisteredFacebookDonation,
  getRegistededFacebookDonationByDonorID,
  registerFacebookCampaignOrgShare,
  removeAllFacebookReports,
  registerFacebookReport,
  isCampaignRegistered,
};
