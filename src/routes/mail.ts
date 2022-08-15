import { DAO } from "../custom_modules/DAO";
import {
  sendDonationRegistered,
  sendEffektDonationReciept,
  sendAvtalegiroNotification,
  sendFacebookTaxConfirmation,
} from "../custom_modules/mail";

const express = require("express");
const router = express.Router();
const mail = require("../custom_modules/mail");
const authMiddleware = require("../custom_modules/authorization/authMiddleware");

router.post(
  "/donation/registered",
  authMiddleware.isAdmin,
  async (req, res, next) => {
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
  }
);

router.post(
  "/donation/receipt/effekt",
  authMiddleware.isAdmin,
  async (req, res, next) => {
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
  }
);

router.post(
  "/avtalegiro/notice",
  authMiddleware.isAdmin,
  async (req, res, next) => {
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

      await sendFacebookTaxConfirmation(recipient, name, paymentID);

      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  }
);

module.exports = router;
