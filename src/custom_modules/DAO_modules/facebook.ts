import { DAO } from "../DAO";
import paymentMethodIDs from "../../enums/paymentMethods";

export type RegisteredFacebookDonation = {
  donorID: number;
  paymentID: string;
  taxUnitID: number;
};

//region Get

async function getAllFacebookDonations() {
  try {
    let [results] = await DAO.query(`
            SELECT PaymentExternal_ID, sum_confirmed, timestamp_confirmed
            FROM Donations
            WHERE Payment_ID = ${paymentMethodIDs.facebook}`);

    return results;
  } catch (ex) {
    throw ex;
  }
}

async function getAllFacebookCampaignIDs() {
  try {
    let [results] = await DAO.query(`
            SELECT ID
            FROM FB_campaigns`);

    return results;
  } catch (ex) {
    throw ex;
  }
}

async function getFacebookReports() {
  try {
    let [results] = await DAO.query(`
            SELECT FB_report
            FROM FB_donation_reports`);

    return results;
  } catch (ex) {
    throw ex;
  }
}

async function getFacebookCampaignOrgShares(ID) {
  try {
    let [results] = await DAO.query(
      `
            SELECT FB_campaign_ID, Org_ID, Share
            FROM FB_campaign_org_shares
            WHERE FB_campaign_ID = ?
            `,
      [ID]
    );

    return results;
  } catch (ex) {
    throw ex;
  }
}

/***
 * Fetches a registered facebooks donation, used to associate a payment ID with a tax unit
 * @param {String} paymentID
 * @returns {Number | null} The ID of the tax unit associated with the paymentID
 */
async function getRegisteredFacebookDonation(
  paymentID: string
): Promise<RegisteredFacebookDonation | null> {
  try {
    let [results] = await DAO.query(
      `
              SELECT donorID, paymentID, taxUnitID
              FROM FB_payment_ID
              WHERE paymentID = ?
              `,
      [paymentID]
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
  } catch (ex) {
    throw ex;
  }
}

async function isCampaignRegistered(ID) {
  try {
    let [results] = await DAO.query(
      `
            SELECT FB_campaign_ID
            FROM FB_campaign_org_shares
            WHERE FB_campaign_ID = ?
            LIMIT 1
            `,
      [ID]
    );

    return results.length > 0;
  } catch (ex) {
    throw ex;
  }
}

//region Add

/***
 * Registers a facebook payment ID and associates it with a donor and tax unit
 * @param {Number} donorID
 * @param {String} paymentID
 * @param {Number} taxUnitID
 * @returns {Boolean} True if successful
 */
async function registerPaymentFB(
  donorID: number,
  paymentID: string,
  taxUnitID: number
) {
  try {
    await DAO.query(
      `
            INSERT INTO FB_payment_ID (donorID, paymentID, taxUnitID)
            VALUES (?, ?, ?)`,
      [donorID, paymentID, taxUnitID]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function registerFacebookCampaign(
  ID,
  Fundraiser_title,
  Source_name,
  Permalink,
  Campaign_owner_name,
  Fundraiser_type
) {
  try {
    await DAO.query(
      `
            INSERT INTO FB_campaigns (ID, Fundraiser_title, Source_name, Permalink, Campaign_owner_name, Fundraiser_type)
            VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ID,
        Fundraiser_title,
        Source_name,
        Permalink,
        Campaign_owner_name,
        Fundraiser_type,
      ]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function registerFacebookReport(report) {
  try {
    await DAO.query(
      `
            INSERT INTO FB_donation_reports (FB_report)
            VALUES (?)`,
      [report]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

async function registerFacebookCampaignOrgShare(FB_campaign_ID, Org_ID, Share) {
  try {
    await DAO.query(
      `
            INSERT INTO FB_campaign_org_shares (FB_campaign_ID, Org_ID, Share)
            VALUES (?, ?, ?)`,
      [FB_campaign_ID, Org_ID, Share]
    );

    return true;
  } catch (ex) {
    throw ex;
  }
}

//region Delete

async function removeAllFacebookReports() {
  try {
    await DAO.query(`
            DELETE FROM FB_donation_reports`);

    return true;
  } catch (ex) {
    throw ex;
  }
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
  registerFacebookCampaignOrgShare,
  removeAllFacebookReports,
  registerFacebookReport,
  isCampaignRegistered,
};
