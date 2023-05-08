import { DAO } from "../custom_modules/DAO";
import {
  sendDonationRegistered,
  sendEffektDonationReciept,
  sendAvtalegiroNotification,
  sendFacebookTaxConfirmation,
  sendTaxYearlyReportNoticeNoUser,
  sendTaxYearlyReportNoticeWithUser,
} from "../custom_modules/mail";

const express = require("express");
const router = express.Router();
const mail = require("../custom_modules/mail");
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

    await sendAvtalegiroNotification(agreement);

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

router.post("/taxreport/notice", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const reportsWithUserOnProfilePage = await DAO.tax.getReportsWithUserOnProfilePage();
    const reportsWithoutUserOnProfilePage = await DAO.tax.getReportsWithoutUserOnProfilePage();

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
});

module.exports = router;
