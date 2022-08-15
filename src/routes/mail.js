const express = require("express");
const router = express.Router();
const DAO = require("../custom_modules/DAO.js");
const mail = require("../custom_modules/mail");
const authMiddleware = require("../custom_modules/authorization/authMiddleware");

router.post(
  "/donation/registered",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      const KID = req.body.KID;
      const sum = req.body.sum;

      await mail.sendDonationRegistered(KID, sum);

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
  "/donation/receipt/effekt",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      const donationID = req.body.donationID;
      const recipient = req.body.recipient;

      await mail.sendEffektDonationReciept(donationID, recipient);

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
  "/avtalegiro/notice",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      const KID = req.body.KID;
      const agreement = await DAO.avtalegiroagreements.getByKID(KID);

      await mail.sendAvtalegiroNotification(agreement);

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
  "/facebook/tax/confirmation",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      const recipient = req.body.recipient;
      const name = req.body.name;
      const paymentID = req.body.paymentID;

      await mail.sendFacebookTaxConfirmation(recipient, name, paymentID);

      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  }
);

router.post("/changes/sci", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (!req.body.emails) return res.sendStatus(400);

    let mails = req.body.emails.split(",");

    let success = 0;
    let failed = 0;

    for (let i = 0; i < mails.length; i++) {
      const donoremail = mails[i];

      let result = await mail.sendSciChanges(donoremail);
      if (result === true) success++;
      else failed++;
    }

    res.json({
      status: 200,
      content: `Sent ${success} mails, ${failed} failed`,
    });
  } catch (ex) {
    next({ ex });
  }
});

module.exports = router;
