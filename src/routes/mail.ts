import { DateTime } from "luxon";
import { DAO } from "../custom_modules/DAO";
import {
  sendDonationRegistered,
  sendEffektDonationReciept,
  sendAvtalegiroNotification,
  sendFacebookTaxConfirmation,
  sendTaxYearlyReportNoticeNoUser,
  sendTaxYearlyReportNoticeWithUser,
  sendDonorMissingTaxUnitNotice,
} from "../custom_modules/mail";

import express from "express";
const router = express.Router();
const authMiddleware = require("../custom_modules/authorization/authMiddleware");

router.post("/donation/registered", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const KID = req.body.KID;
    const sum = req.body.sum;

    await sendDonationRegistered(KID, sum);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/donation/receipt/effekt", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const donationID = req.body.donationID;
    const recipient = req.body.recipient;

    await sendEffektDonationReciept(donationID, recipient);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/avtalegiro/notice", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const KID = req.body.KID;
    const agreement = await DAO.avtalegiroagreements.getByKID(KID);

    let claimDate: DateTime = null;
    const now = DateTime.local();

    if (agreement.paymentDate > now.day) {
      claimDate = DateTime.local(now.year, now.month, agreement.paymentDate);
    } else {
      claimDate = DateTime.local(now.year, now.month, agreement.paymentDate).plus({ month: 1 });
    }

    await sendAvtalegiroNotification(agreement, claimDate);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/facebook/tax/confirmation", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const recipient = req.body.recipient;
    const name = req.body.name;
    const paymentID = req.body.paymentID;

    await sendFacebookTaxConfirmation(recipient, name, paymentID);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post(
  "/taxreport/notice",
  /*authMiddleware.isAdmin,*/ async (req, res, next) => {
    try {
      const reportsWithUserOnProfilePage = await DAO.tax.getReportsWithUserOnProfilePage();
      const reportsWithoutUserOnProfilePage = []; //await DAO.tax.getReportsWithoutUserOnProfilePage();

      let successfullySent = 0;
      let failedToSend = 0;

      // Batch send to all users with profile page, maximum 10 at a time
      // Using Promise.all to send all at once
      let results = [];
      const totalEmails =
        reportsWithUserOnProfilePage.length + reportsWithoutUserOnProfilePage.length;
      while (successfullySent + failedToSend < totalEmails) {
        const promises = [];
        const MAX_CONCURRENT = 10;

        console.log(
          `Batch sending ${MAX_CONCURRENT} reports (total: ${
            successfullySent + failedToSend
          }) (success: ${successfullySent}) (failed: ${failedToSend})...`,
        );

        for (let i = 0; i < MAX_CONCURRENT; i++) {
          if (reportsWithUserOnProfilePage.length > 0) {
            const report = reportsWithUserOnProfilePage.pop();
            promises.push(sendTaxYearlyReportNoticeWithUser(report));
          } else if (reportsWithoutUserOnProfilePage.length > 0) {
            const report = reportsWithoutUserOnProfilePage.pop();
            promises.push(sendTaxYearlyReportNoticeNoUser(report));
          } else {
            break;
          }
        }

        const results = await Promise.allSettled(promises);
        results.forEach((result) => {
          results.push(result);
          if (result.status === "fulfilled") {
            successfullySent++;
          } else {
            console.error("Failed to send", result.reason);
            failedToSend++;
          }
        });
      }

      res.json({
        status: 200,
        content: {
          success: successfullySent,
          failed: failedToSend,
          results: results,
        },
      });
    } catch (ex) {
      next(ex);
    }
  },
);

/**
 * Sends a notice to all donors that are eligible for tax deduction in the given year
 * Specify a list of emails to exclude from the notice, a tax year (usually the year before the current year)
 * and a minimum sum for the donations in the given year to qualify for tax deduction (500 for 2023 f.ex.)
 */
router.post("/notice/missingtaxunit", authMiddleware.isAdmin, async (req, res, next) => {
  const { excludedEmails, year, minSum } = req.body;
  if (!year || !minSum) {
    res.status(400).json({
      status: 400,
      content: "Missing parameters year or minSum",
    });
    return;
  }

  const donorsWithDonationsMissingTaxUnit = await DAO.tax.getDonorsEligableForDeductionInYear(
    year,
    minSum,
    excludedEmails,
  );

  let successfullySent = 0;
  let failedToSend = 0;
  const totalEmails = donorsWithDonationsMissingTaxUnit.length;

  // Batch send to all donors, maximum 10 at a time
  // Using Promise.all to send all at once
  let results = [];
  while (successfullySent + failedToSend < totalEmails) {
    const promises = [];
    const MAX_CONCURRENT = 10;

    console.log(
      `Batch sending ${MAX_CONCURRENT} reports (total: ${
        successfullySent + failedToSend
      }) (success: ${successfullySent}) (failed: ${failedToSend})...`,
    );

    for (let i = 0; i < MAX_CONCURRENT; i++) {
      if (donorsWithDonationsMissingTaxUnit.length > 0) {
        const donor = donorsWithDonationsMissingTaxUnit.pop();
        promises.push(sendDonorMissingTaxUnitNotice(donor, year));
      } else {
        break;
      }
    }

    const results = await Promise.allSettled(promises);
    results.forEach((result) => {
      results.push(result);
      if (result.status === "fulfilled") {
        successfullySent++;
      } else {
        console.error("Failed to send", result.reason);
        failedToSend++;
      }
    });
  }

  res.json({
    status: 200,
    content: {
      success: successfullySent,
      failed: failedToSend,
      results: results,
    },
  });
});

module.exports = router;
