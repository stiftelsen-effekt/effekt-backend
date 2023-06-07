import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendOcrBackup } from "../custom_modules/mail";
import { DAO } from "../custom_modules/DAO";
import { getDueDates } from "../custom_modules/avtalegiro";
import { checkIfAcceptedReciept, getLatestOCRFile, sendFile } from "../custom_modules/nets";
import { DateTime } from "luxon";

import express from "express";
import { AvtaleGiroAgreement } from "../custom_modules/DAO_modules/avtalegiroagreements";

const router = express.Router();
const ocrParser = require("../custom_modules/parsers/OCR");
const ocr = require("../custom_modules/ocr");
const vipps = require("../custom_modules/vipps");
const avtalegiroParser = require("../custom_modules/parsers/avtalegiro");
const avtalegiro = require("../custom_modules/avtalegiro");

const META_OWNER_ID = 3;

/**
 * Triggered every day by a google cloud scheduler webhook at 20:00
 */
router.post("/ocr", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    /**
     * Fetch the latest OCR file
     * This file contains transactions to our account with KID, both with normal
     * giro and avtalegiro.
     * It also contains information about created, updated and deleted avtalegiro
     * agreements.
     */
    const latestOcrFile = await getLatestOCRFile();

    if (latestOcrFile === null) {
      //No files found in SFTP folder
      //Most likely because it's a holiday or weekend
      await DAO.logging.add("OCR", { nofile: true });
      res.send("No file");
      return true;
    }

    /**
     * Parse incomming transactions and add them to the database
     */
    const parsedTransactions = ocrParser.parse(latestOcrFile.toString());

    // Results are added in paralell to the database
    // Alongside sending donation reciepts
    const addedDonations = await ocr.addDonations(parsedTransactions, META_OWNER_ID);

    /**
     * Parse avtalegiro agreement updates from file and update database
     */
    const parsedAgreements = avtalegiroParser.parse(latestOcrFile.toString());
    const updatedAgreements = await avtalegiro.updateAgreements(parsedAgreements);

    const result = {
      addedDonations,
      updatedAgreements,
      file: latestOcrFile.toString(),
    };

    await DAO.logging.add("OCR", result);
    await sendOcrBackup(JSON.stringify(result, null, 2));
    res.json(result);
  } catch (ex) {
    next({ ex });
  }
});

/**
 * Triggered by a google cloud scheduler webhook every day at 10:00
 */
router.post("/avtalegiro", authMiddleware.isAdmin, async (req, res, next) => {
  let result;
  try {
    let today;
    if (req.query.date) {
      today = DateTime.fromJSDate(new Date(req.query.date));
    } else {
      today = DateTime.fromJSDate(new Date());
    }

    const claimDates = getDueDates(today);
    for (let claimDate of claimDates) {
      // Check if dates are last day of month
      const isClaimDateLastDayOfMonth = claimDate.day == today.endOf("month").day;

      /**
       * Get active agreements
       */
      let agreements = await DAO.avtalegiroagreements.getByPaymentDate(claimDate.day);
      if (isClaimDateLastDayOfMonth) {
        agreements = [...agreements, ...(await DAO.avtalegiroagreements.getByPaymentDate(0))];
      }

      if (agreements.length > 0) {
        /**
         * Notify agreements to be charged
         */
        let notifiedAgreements = {
          success: 0,
          failed: 0,
        };
        if (req.query.notify) {
          notifiedAgreements = await avtalegiro.notifyAgreements(
            agreements.filter((agreement) => agreement.notice == true),
            claimDate,
          );
        }

        /**
         * Create file to charge agreements for current day
         */
        const shipmentID = await DAO.avtalegiroagreements.addShipment(agreements.length);
        const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(
          shipmentID,
          agreements,
          claimDate,
        );

        /**
         * Send file to nets
         */
        const filename =
          "DIRREM" +
          today.toFormat("ddLLyy") +
          "." +
          claimDate.toFormat("ddLLyy") +
          "." +
          shipmentID;
        await sendFile(avtaleGiroClaimsFile, filename);

        result = {
          notifiedAgreements,
          file: avtaleGiroClaimsFile.toString(),
        };
      } else {
        result = {
          notifiedAgreements: null,
          file: null,
        };
      }

      await DAO.logging.add("AvtaleGiro", result);
      await sendOcrBackup(JSON.stringify(result, null, 2));
    }
    res.send("OK");
  } catch (ex) {
    next({ ex });
  }
});

/**
 * Triggered by a google cloud scheduler webhook every day at 11:00, 12:00 and 13:00
 */
router.post("/avtalegiro/retry", authMiddleware.isAdmin, async (req, res, next) => {
  let result;
  try {
    let today: DateTime;
    if (req.query.date) {
      today = DateTime.fromJSDate(new Date(req.query.date));
    } else {
      today = DateTime.fromJSDate(new Date());
    }

    const claimDates = getDueDates(today);

    console.log(claimDates.map((claimDate) => claimDate.toISO()));

    const shipmentIDs = await DAO.avtalegiroagreements.getShipmentIDs(today);
    console.log(shipmentIDs);

    // Remove elements from shipment ID's up to claimDate length is left
    shipmentIDs.splice(0, shipmentIDs.length - claimDates.length);
    console.log(shipmentIDs);
    for (let claimDate of claimDates) {
      /**
       * Check if we have recieved an "accepted" reciept from MasterCard (Nets)
       * If not, we should retry and send file again
       */

      // Get first shipment ID from array for each claim date
      const shipmentID = shipmentIDs.shift();
      console.log(shipmentID, shipmentIDs);

      // If shipment ID is undefined, we're missing a shipment for the claim date
      // Something might have gone wrong, so we should retry
      // Else we should check if we have recieved an accepted reciept
      if (typeof shipmentID !== "undefined") {
        let accepted = await checkIfAcceptedReciept(shipmentID);
        console.log(`Accepted reciept for shipment ${shipmentID}: ${accepted}`);
        if (accepted) {
          continue;
        }
      }

      // Check if dates are last day of month
      const isClaimDateLastDayOfMonth = claimDate.day == today.endOf("month").day;

      /**
       * Get active agreements
       */
      let agreements = await DAO.avtalegiroagreements.getByPaymentDate(claimDate.day);
      if (isClaimDateLastDayOfMonth) {
        agreements = [...agreements, ...(await DAO.avtalegiroagreements.getByPaymentDate(0))];
      }

      if (agreements.length > 0) {
        /**
         * Notify agreements to be charged
         */
        let notifiedAgreements = {
          success: 0,
          failed: 0,
        };

        /**
         * Create file to charge agreements for current day
         */
        const shipmentID = await DAO.avtalegiroagreements.addShipment(agreements.length);
        const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(
          shipmentID,
          agreements,
          claimDate,
        );

        /**
         * Send file to nets
         */
        const filename =
          "DIRREM" +
          today.toFormat("ddLLyy") +
          "." +
          claimDate.toFormat("ddLLyy") +
          "." +
          shipmentID;
        await sendFile(avtaleGiroClaimsFile, filename);

        result = {
          notifiedAgreements,
          file: avtaleGiroClaimsFile.toString(),
        };
      } else {
        return res.json({
          status: 200,
          content: "No agreements",
        });
      }

      await DAO.logging.add("AvtaleGiro - Retry", result);
      await sendOcrBackup(JSON.stringify(result, null, 2));
    }
    res.send("OK");
  } catch (ex) {
    console.error(ex);
    next({ ex });
  }
});

router.post("/vipps", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    // Synchronize effektDB with Vipps database before creating daily charges
    await vipps.synchronizeVippsAgreementDatabase();

    // Creates charges for all Vipps recurring agreements that are due three days ahead
    const result = await vipps.createFutureDueCharges();
    if (result) await DAO.logging.add("VippsRecurring", result);

    res.json(result);
  } catch (ex) {
    next({ ex });
  }
});

module.exports = router;
