import paymentMethods from "../enums/paymentMethods";

const e = require("express");
const express = require("express");
const router = express.Router();
const DAO = require("../custom_modules/DAO.js");
const mail = require("../custom_modules/mail");
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const donationHelpers = require("../custom_modules/donationHelpers");

function throwError(message) {
  let error = new Error(message);
  (error as any).status = 400;
  throw error;
}

router.get("/payments/all", async (req, res, next) => {
  try {
    const content = await DAO.facebook.getAllFacebookDonations();

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post(
  "/register/payment",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      const paymentID = req.body.paymentID;
      const email = req.body.email;
      const full_name = req.body.full_name;
      const ssn = req.body.ssn;
      const newsletter = req.body.newsletter;

      if (!paymentID) {
        throwError("Missing param paymentID");
      } else if (!email) {
        throwError("Missing param email");
      } else if (!full_name) {
        throwError("Missing param full_name");
      } else if (!ssn) {
        throwError("Missing param ssn");
      } else if (!newsletter) {
        throwError("Missing param newsletter");
      }

      const ID = await DAO.donors.getIDbyEmail(email);

      // If donor does not exist, create new donor
      if (!ID) {
        const donorID = await DAO.donors.add(email, full_name, ssn, newsletter);

        await DAO.facebook.registerPaymentFB(donorID, paymentID);
      }
      // If donor already exists, update ssn if empty
      else if (ID) {
        const donorID = ID;
        const donor = await DAO.donors.getByID(ID);

        if (!donor.ssn) await DAO.donors.updateSsn(donorID, ssn);
        await DAO.donors.updateNewsletter(donorID, newsletter);

        await DAO.facebook.registerPaymentFB(donorID, paymentID);
      }

      await mail.sendFacebookTaxConfirmation(email, full_name, paymentID);

      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  }
);

router.post(
  "/register/campaign",
  // authMiddleware.isAdmin, TODO: uncomment
  async (req, res, next) => {
    try {
      const campaignShares = req.body.shares;
      for (let i = 0; i < campaignShares.length; i++) {
        const campaignShare = campaignShares[i];
        if (campaignShare.share > 0) {
          await DAO.facebook.registerFacebookCampaignOrgShare(
            req.body.id,
            campaignShare.organizationId,
            campaignShare.share
          );
        }
      }

      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  }
);

router.post(
  "/register/donations",
  // authMiddleware.isAdmin, TODO: uncomment
  async (req, res, next) => {
    let metaOwner = parseInt(req.body.metaOwnerID);

    let donations;
    let invalidTransactions = [];
    let valid = 0;
    let invalid = 0;

    try {
      const res = await DAO.facebook.getFacebookReports();
      donations = JSON.parse(res[0].FB_report.toString("utf-8"));
    } catch (ex) {
      next(ex);
      return false;
    }

    for (let i = 0; i < donations.length; i++) {
      const donation = donations[i];
      const externalRef = donation["Payment ID"];
      const campaignID = donation["Campaign ID"];
      let email = donation.Email;
      const fullName = donation.FullName;

      const donationInfo = {
        amount: donation.sumNOK,
        date: donation["Charge date"],
        KID: undefined,
        paymentID: paymentMethods.facebook,
        transactionID: externalRef,
        metaOwnerID: metaOwner,
        name: donation.FullName,
        FBLink: donation.Permalink,
        FBCampaignName: donation["Fundraiser title"],
      };

      try {
        console.log("Processing donation with ID:", externalRef);

        let donorID: string;
        // Fetch newly created donor
        if (email != "") {
          donorID = await DAO.donors.getIDbyEmail(email);
        }
        if (donorID == null) {
          donorID = await DAO.donors.getIDByMatchedNameFB(fullName);
        }
        if (donorID == null) {
          email =
            "donasjon" +
            String(fullName).toLowerCase().replace(" ", "_") +
            "@gieffektivt.no";
          donorID = await DAO.donors.add(email, fullName);
        }

        const campaignOrgShares =
          await DAO.facebook.getFacebookCampaignOrgShares(campaignID);
        const orgShares = campaignOrgShares.filter((campaignOrgShare) => {
          if (campaignOrgShare.FB_campaign_ID == campaignID) {
            return campaignOrgShare;
          }
        });

        let distribution: { [name: string]: number | string }[] = [];
        let distSum: number = 0;

        for (let i = 0; i < orgShares.length; i++) {
          const orgShare = orgShares[i];
          const splitNok = (orgShare.Share / 100) * donation.sumNOK;

          if (splitNok > 0) {
            distribution.push({
              organizationID: orgShare.Org_ID,
              share: String(Math.round(orgShare.Share * 100) / 100),
            });
            distSum += splitNok;
          }
        }
        // Check if distribution sum is correct
        if (Math.round(distSum) != Math.round(donation.sumNOK)) {
          invalid++;
          invalidTransactions.push({
            transaction: donationInfo,
            reason:
              "Donation" +
              String(externalRef) +
              ": Distribution sum " +
              String(distSum) +
              " different than actual sum " +
              String(donation.sumNOK),
          });
          continue;
        }

        // Check if distribution share adds to 100%
        let distTotalPercent: number = 0;
        distribution.forEach(
          (org, i) => (distTotalPercent += parseFloat(String(org.share)))
        );

        if (Math.round(distTotalPercent) != 100) {
          invalid++;
          invalidTransactions.push({
            transaction: donation,
            reason:
              "Donation" +
              String(externalRef) +
              ": Total distribution percent " +
              String(distTotalPercent) +
              " not 100.",
          });
          continue;
        } else if (distTotalPercent != 100) {
          // Adjusts share of first organization to create a 100% total
          distribution[0].share = String(
            Math.round(
              parseFloat(String(distribution[0].share)) +
                100 -
                distTotalPercent * 100
            ) / 100
          );
        }

        let KID = await DAO.distributions.getKIDbySplit(distribution, donorID);
        if (!KID) {
          KID = await donationHelpers.createKID(15, parseInt(donorID));
          await DAO.distributions.add(distribution, KID, donorID, metaOwner);
        }
        donationInfo.KID = KID;

        if (typeof KID !== "string") {
          invalid++;
          invalidTransactions.push({
            transaction: donationInfo,
            reason:
              "Donation" +
              String(externalRef) +
              ": KID " +
              String(KID) +
              " not valid or not found. ",
          });
          continue;
        }
        await DAO.donations.add(
          donationInfo.KID,
          donationInfo.paymentID,
          donationInfo.amount,
          donationInfo.date,
          donationInfo.transactionID,
          donationInfo.metaOwnerID
        );

        valid++;
      } catch (ex) {
        invalid++;
        invalidTransactions.push({
          transaction: donationInfo,
          reason: "Donation" + String(externalRef) + ": " + ex.message,
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
  }
);

module.exports = router;
