const DAO = require("../../custom_modules/DAO.js");
const facebookParser = require("../../custom_modules/parsers/facebook.ts");
import { Blob } from "buffer";

module.exports = async (req, res, next) => {
  if (!req.files || !req.files.report) return res.sendStatus(400);

  let donations;
  try {
    await DAO.facebook.removeAllFacebookReports();
    donations = await facebookParser.parseReport(req.files.report.data);
    const blobDonations = new Blob([JSON.stringify(donations)], {
      type: "application/json",
    });
    await DAO.facebook.registerFacebookReport(JSON.stringify(donations));
  } catch (ex) {
    next(ex);
    return false;
  }
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
        campaign.Fundraiser_type
      );
    }
  }

  // Check if campaign has stored shares and send to admin panel if not
  const campaignsWithMissingShares = [];
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
  res.json({
    status: 200,
    content: { fbCampaigns: campaignsWithMissingShares },
  });
};
