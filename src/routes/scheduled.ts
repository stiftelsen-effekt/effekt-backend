import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendOcrBackup, sendPlaintextErrorMail } from "../custom_modules/mail";
import { DAO } from "../custom_modules/DAO";
import { getDueDates } from "../custom_modules/avtalegiro";
import { checkIfAcceptedReciept, getLatestOCRFile, sendFile } from "../custom_modules/nets";
import { DateTime } from "luxon";

import express from "express";
import { generateAutogiroGiroFile } from "../custom_modules/autogiro";
import fetch from "node-fetch";
import config from "../config";

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

    const shipmentIDs = await DAO.avtalegiroagreements.getShipmentIDs(today);

    // Remove elements from shipment ID's up to claimDate length is left
    shipmentIDs.splice(0, shipmentIDs.length - claimDates.length);
    for (let claimDate of claimDates) {
      /**
       * Check if we have recieved an "accepted" reciept from MasterCard (Nets)
       * If not, we should retry and send file again
       */

      // Get first shipment ID from array for each claim date
      const shipmentID = shipmentIDs.shift();

      // If shipment ID is undefined, we're missing a shipment for the claim date
      // Something might have gone wrong, so we should retry
      // Else we should check if we have recieved an accepted reciept
      if (typeof shipmentID !== "undefined") {
        let accepted = await checkIfAcceptedReciept(shipmentID);
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

router.post("/autogiro", authMiddleware.isAdmin, async (req, res, next) => {
  let result;
  try {
    const today = DateTime.fromJSDate(new Date());
    const claimDate = today.plus({ days: 3 });

    /**
     * Get active agreements
     */
    const agreements = await DAO.autogiroagreements.getAgreementsByPaymentDate(claimDate.day);
    const mandatesToBeConfirmed = await DAO.autogiroagreements.getMandatesByStatus("NEW");

    if (agreements.length > 0 || mandatesToBeConfirmed.length > 0) {
      /**
       * Create file to charge agreements for current day
       */
      const shipmentID = await DAO.autogiroagreements.addShipment(agreements.length);
      const autoGiroClaimsFile = await generateAutogiroGiroFile(
        shipmentID,
        agreements,
        mandatesToBeConfirmed,
        claimDate,
      );

      result = {
        shipmentID: shipmentID,
        numCharges: agreements.length,
        numMandatesToBeConfirmed: mandatesToBeConfirmed.length,
        file: autoGiroClaimsFile.toString(),
        filename: `BFEP.IAGAG.${shipmentID}.${today.toFormat("yyLLdd.HHmmss")}`,
      };
    } else {
      result = {
        shipmentID: null,
        numCharges: 0,
        mandatesToBeConfirmed: 0,
        file: null,
        filename: null,
      };
    }

    await DAO.logging.add("AutoGiro", result);
    // await sendOcrBackup(JSON.stringify(result, null, 2));
    res.json({
      status: 200,
      content: result,
    });
  } catch (ex) {
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

/**
 * Check that the user metadata value for donor id matches the email address for the donor in database
 */
router.get("/auth0/validateusers", authMiddleware.isAdmin, async (req, res, next) => {
  /**
   * Fetch Auth0 managment token
   */

  const token = await fetch("https://gieffektivt.eu.auth0.com/oauth/token", {
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: "https://gieffektivt.eu.auth0.com/api/v2/",
      grant_type: "client_credentials",
    }),
    method: "POST",
  }).then((res) => res.json());

  /**
   * Calling https://gieffektivt.eu.auth0.com/api/v2/users?page=0&fields=email,user_metadata&include_totals=true&per_page=100
   *
   * Returns a list of all users with email and user_metadata with the following format:
   *
   *  {
   *  	"start": 0,
   *  	"limit": 100,
   *  	"length": 100,
   *  	"users": [
   *  		{
   *  			"email": "donor@gmail.com",
   *  			"user_metadata": {
   *  				"gieffektivt-user-id": 13139
   *  			}
   *  		},
   *  		{
   *  			(...)
   *  		},
   *  		{
   *  			"email": "donor2@gmail.com",
   *  			"user_metadata": {
   *  				"gieffektivt-user-id": 74782
   *  			}
   *  		}
   *  	],
   *  	"total": 880
   *  }
   *
   * We want to check that the user_metadata.gieffektivt-user-id matches the id of the user in the database
   *
   * First we get all users from Auth0
   * Start by getting the first page
   * Then we get the total number of users
   * Then we get the rest of the pages in paralell
   */

  const perPage = 100;

  const users = [];

  const firstPage = await fetch(
    `https://gieffektivt.eu.auth0.com/api/v2/users?page=0&fields=email,user_metadata&include_totals=true&per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    },
  ).then((res) => res.json());

  users.push(...firstPage.users);

  const numberOfPages = Math.ceil(firstPage.total / perPage);

  const promises = [];
  for (let i = 1; i < numberOfPages; i++) {
    promises.push(
      fetch(
        `https://gieffektivt.eu.auth0.com/api/v2/users?page=${i}&fields=email,user_metadata&include_totals=true&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
          },
        },
      ).then((res) => res.json()),
    );
  }

  const results = await Promise.allSettled(promises);

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      users.push(...result.value.users);
    } else {
      console.error(result.reason);
    }
  });

  /**
   * Now we have all the users from Auth0
   * We need to check that the user_metadata.gieffektivt-user-id matches the id of the user in the database
   */
  const mismatchedUsers = [];

  for (const user of users) {
    const email = user.email;

    if (!email || typeof email !== "string") {
      console.warn(`User has no email in Auth0`);
      continue;
    }

    const userMetadata = user.user_metadata;
    if (!userMetadata || !userMetadata[config.authUserMetadataKey]) {
      console.warn(
        `User ${user.email} has no user_metadata or no ${config.authUserMetadataKey} in user_metadata`,
      );
      continue;
    }

    const userId = userMetadata[config.authUserMetadataKey];
    const alternateEmail = userMetadata["donor-email"] || "";

    const userInDatabase = await DAO.donors.getByID(userId);

    if (!userInDatabase) {
      console.warn(`User ${userId} with email ${email} in Auth0 has no user in database`);
      mismatchedUsers.push({ userId, email, reason: "No user in database" });
      continue;
    }

    if (
      userInDatabase.email.trim().toLowerCase() !== email.trim().toLowerCase() &&
      userInDatabase.email.trim().toLowerCase() !== alternateEmail.trim().toLowerCase()
    ) {
      console.warn(
        `User ${userId} has email ${email} in Auth0, but email ${userInDatabase.email} in database`,
      );
      mismatchedUsers.push({ userId, email, reason: "Email mismatch" });
    }
  }

  if (mismatchedUsers.length > 0) {
    console.warn(`Found ${mismatchedUsers.length} mismatched users`);
  }

  const result = {
    matched: users.length - mismatchedUsers.length,
    mismatched: mismatchedUsers.length,
    mismatchedUsers,
  };

  await DAO.logging.add("Auth0 check", result);

  if (mismatchedUsers.length > 0) {
    await sendPlaintextErrorMail(
      JSON.stringify(mismatchedUsers, null, 2),
      "Mismatched users",
      "Mismatched users",
    );
  }

  res.json({
    status: 200,
    content: result,
  });
});

module.exports = router;
