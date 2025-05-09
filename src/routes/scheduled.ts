import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import {
  sendOcrBackup,
  sendPaymentIntentFollowUp,
  sendPlaintextErrorMail,
} from "../custom_modules/mail";
import { DAO } from "../custom_modules/DAO";
import { getDueDates } from "../custom_modules/avtalegiro";
import { checkIfAcceptedReciept, getLatestOCRFile, sendFile } from "../custom_modules/nets";
import { DateTime } from "luxon";
import mailchimp from "@mailchimp/mailchimp_marketing";

import express from "express";
import { generateAutogiroGiroFile, getSeBankingDaysBetweenDates } from "../custom_modules/autogiro";
import fetch from "node-fetch";
import { initialpaymentmethod } from "../custom_modules/DAO_modules/initialpaymentmethod";
import paymentMethods from "../enums/paymentMethods";
import { AutoGiro_agreements, Payment_follow_up, Payment_intent } from "@prisma/client";
import { getAllInflationEligibleAgreements } from "../custom_modules/inflationadjustment";
import { processFundraisingCrawler } from "../custom_modules/adoveo";
import { RequestLocale } from "../middleware/locale";

const router = express.Router();
const ocrParser = require("../custom_modules/parsers/OCR");
const ocr = require("../custom_modules/ocr");
const vipps = require("../custom_modules/vipps");
const avtalegiroParser = require("../custom_modules/parsers/avtalegiro");
const avtalegiro = require("../custom_modules/avtalegiro");
const config = require("../config");

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
      agreements = agreements.filter((agreement) => agreement.amount > 0);

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

      agreements = agreements.filter((agreement) => agreement.amount > 0);
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

    const agreements = await DAO.autogiroagreements.getAgreementsToCharge();

    let agreementsToClaim: {
      agreement: AutoGiro_agreements;
      claimDate: DateTime;
    }[] = [];
    for (let agreement of agreements) {
      if (agreement.payment_date === 0) {
        const lastDayOfMonth = today.endOf("month");
        agreementsToClaim.push({
          agreement,
          claimDate: lastDayOfMonth,
        });
        continue;
      }

      if (
        agreement.payment_date <= today.day &&
        agreement.created.getDate() < agreement.payment_date
      ) {
        let skewedDate = DateTime.now().plus({ days: 1 });
        while (getSeBankingDaysBetweenDates(today, skewedDate) < 1) {
          if (skewedDate.month !== today.month) {
            console.error("Skewed date is in next month");
            break;
          }
          skewedDate = skewedDate.plus({ days: 1 });
        }
        agreementsToClaim.push({
          agreement,
          claimDate: skewedDate,
        });
        continue;
      }

      const claimDate = today.set({ day: agreement.payment_date });
      agreementsToClaim.push({
        agreement,
        claimDate: claimDate,
      });
    }

    const mandatesToBeConfirmed = await DAO.autogiroagreements.getMandatesByStatus("NEW");
    const amendmentCandidates = await DAO.autogiroagreements.getAmendmentCandidates();

    /* Check if the claim date is within the timeframe where we can send the file
     * We need at least one banking day between the claim date and today
     */
    const chargesToAmend = amendmentCandidates.filter((candidate) => {
      const claimDate =
        candidate.agreementDay == 0
          ? DateTime.now().endOf("month")
          : DateTime.now().set({ day: candidate.agreementDay });
      if (claimDate.diff(today, "days").days > 0) {
        // Find the number of banking days between today and the claim date
        const bankingDaysBetween = getSeBankingDaysBetweenDates(today, claimDate);
        return bankingDaysBetween > 0;
      }
      return false;
    });

    agreementsToClaim = agreementsToClaim.filter((agreement) => {
      return !chargesToAmend.some((charge) => charge.agreementId === agreement.agreement.ID);
    });

    if (
      agreementsToClaim.length > 0 ||
      mandatesToBeConfirmed.length > 0 ||
      chargesToAmend.length > 0
    ) {
      /**
       * Create file to charge agreements for current day
       */
      const shipmentID = await DAO.autogiroagreements.addShipment(agreementsToClaim.length);

      let autoGiroClaimsFile: Buffer;
      try {
        autoGiroClaimsFile = await generateAutogiroGiroFile(
          shipmentID,
          agreementsToClaim,
          chargesToAmend,
          mandatesToBeConfirmed,
        );
      } catch (ex) {
        console.error(ex);
        await DAO.autogiroagreements.removeShipment(shipmentID);
        throw new Error("Error generating file");
      }

      result = {
        shipmentID: shipmentID,
        numCharges: agreementsToClaim.length,
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
 * Triggered by a google cloud scheduler webhook every day at 02:00
 * Syncs mailchimp newsletter subscription list with donor database
 */
router.post("/mailchimp/newsletter/sync", authMiddleware.isAdmin, async (req, res, next) => {
  mailchimp.setConfig({
    apiKey: config.mailchimp_api_key,
    server: config.mailchimp_server,
  });

  // Counters
  let addedToMailchimp = 0;
  let failedAddedToMailchimp = 0;
  let addedToDonor = 0;
  let removedFromMailchimp = 0;
  let removedFromDonor = 0;
  let failures = [];

  try {
    let members = [];
    let offset = 0;
    const count = 1000;

    while (true) {
      const result = await mailchimp.lists.getListMembersInfo("4c98331f9d", {
        fields: ["members.email_address", "members.status"],
        count: 1000,
        offset: offset,
      });
      members = members.concat(result.members);
      if (result.members.length < count) break;
      else offset += count;
    }
    console.log("Found ", members.length, "mailchimp members for list");

    // Create a map of members with email as key and status as value
    const membersMap = members.reduce((map, member) => {
      map[member.email_address.toLowerCase().trim()] = member.status;
      return map;
    }, {});

    // Go through db donors and update mailchimp status
    const subscibersToAdd = Math.max(Math.round(Math.random() * 4 - 1), 0);
    console.log("Adding max", subscibersToAdd, "subscribers to mailchimp");

    let donors = [];
    let page = 0;
    while (true) {
      const newDonors = await DAO.donors.getAll(null, page, count, null, RequestLocale.NO);
      if (newDonors.rows.length === 0) break;
      donors = donors.concat(newDonors.rows);
      if (donors.length < count) break;

      page++;
    }

    donors = donors.sort((a, b) => b.registered - a.registered);

    for (let donor of donors) {
      const email = donor.email.toLowerCase().trim();
      if (donor.newsletter) {
        if (email in membersMap) {
          if (membersMap[email] == "unsubscribed") {
            // Donor has newsletter set to true in DB
            // but mailchimp says they have actively unsubscribed
            // Set DB donor newsletter to false
            console.log("Found member", donor.email, "with status", membersMap[email]);
            removedFromDonor++;
            await DAO.donors.updateNewsletter(donor.id, false);
          } else {
            // Newsletter on DB donor is true and status in mailchimp is
            // either pending or cleaned. Do nothing.
          }
          continue;
        } else {
          // Donor has newsletter set to true on their DB donor, but are not subscribed in mailchimp
          // add them
          if (subscibersToAdd <= addedToMailchimp) {
            console.log("Added max subscribers to mailchimp");
            continue;
          }

          console.log("Adding", donor.email, "to mailchimp");
          try {
            await mailchimp.lists.addListMember("4c98331f9d", {
              email_address: email,
              status: "subscribed",
            });
            addedToMailchimp++;
          } catch (ex) {
            const parsedError = JSON.parse(ex.response.text);
            if (parsedError.detail.match(/.*looks fake or invalid.*/)) {
              console.log("Failed to add", donor.email, "to mailchimp. Looks fake or invalid");
              continue;
            } else {
              failedAddedToMailchimp++;
              failures.push(ex);
            }
          }
          continue;
        }
      } else {
        if (email in membersMap) {
          if (membersMap[email] === "subscribed") {
            // Donor has newsletter set to false, but is marked as subscribed in mailchimp
            // They could for example have started subscribing at a later date (after donating)
            console.log("Updating newsletter status to true for ", donor.email);
            await DAO.donors.updateNewsletter(donor.id, true);
            addedToDonor++;
          } else {
            // Newsletter is either pending, cleaned or they have unsubscribed according to malichimp,
            // and the db donor has newsletter set as false. Do nothing.
          }
          continue;
        } else {
          // Donor email not in mailchimp and newsleter in DB is false. Do nothing.
          continue;
        }
      }
    }

    await DAO.logging.add("MailChimp sync", {
      addedToMailchimp,
      addedToDonor,
      removedFromDonor,
      removedFromMailchimp,
      failures,
    });

    return res.json({
      status: 200,
      content: {
        addedToMailchimp,
        failedAddedToMailchimp,
        addedToDonor,
        removedFromDonor,
        removedFromMailchimp,
        failures,
      },
    });
  } catch (ex) {
    try {
      await DAO.logging.add("(Failed - Partial) Mailchimp sync", {
        addedToMailchimp,
        addedToDonor,
        removedFromDonor,
        removedFromMailchimp,
        failures,
      });
    } catch (loggingException) {
      console.error(loggingException);
      next({ ex });
      return;
    }
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

router.post("/fundraiser/crawler", authMiddleware.isAdmin, async (req, res, next) => {
  if (!req.body.token) {
    return res.status(400).json({
      status: 400,
      message: "Missing adoveo token",
    });
  }

  const token = req.body.token;

  await processFundraisingCrawler(token);

  res.json({
    status: 200,
    message: "Crawler completed",
  });
});

type FollowUpConfig = {
  daysBeforeFollowUp: number;
  maxFollowUps: number;
};

type ConditionalFollowUpConfig = FollowUpConfig & {
  paymentMethod: number;
  amountRange: { min: number; max: number };
};

// Default config is now to not follow up
const defaultFollowUpConfig: FollowUpConfig = {
  daysBeforeFollowUp: 5,
  maxFollowUps: 0,
};

const conditionalFollowUpConfig: ConditionalFollowUpConfig[] = [
  // Send additional follow-ups for all bank payments over 100 NOK
  // They are also sent out earlier than the default follow-up
  {
    paymentMethod: paymentMethods.bank,
    amountRange: { min: 100, max: Infinity },
    daysBeforeFollowUp: 5,
    maxFollowUps: 1,
  },
];

/**
 * Route to initiate follow-up on incomplete donations.
 */
function groupPaymentIntentsByKID(
  paymentIntents: Payment_intent[],
): Record<string, Payment_intent[]> {
  return paymentIntents.reduce((acc, intent) => {
    if (!acc[intent.KID_fordeling]) {
      acc[intent.KID_fordeling] = [];
    }
    acc[intent.KID_fordeling].push(intent);
    return acc;
  }, {} as Record<string, Payment_intent[]>);
}

function getMostRecentIntent(intents: Payment_intent[]): Payment_intent {
  return intents.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest,
  );
}

function getFollowUpConfig(paymentMethod: number, paymentAmount: number) {
  let config = { ...defaultFollowUpConfig };
  for (const conditionalConfig of conditionalFollowUpConfig) {
    if (
      conditionalConfig.paymentMethod === paymentMethod &&
      paymentAmount >= conditionalConfig.amountRange.min &&
      paymentAmount <= conditionalConfig.amountRange.max
    ) {
      config = { ...conditionalConfig };
      break;
    }
  }
  return config;
}

function hasEnoughTimePassed(timestamp: Date, daysToWait: number): boolean {
  const timePassed = new Date().getTime() - timestamp.getTime();
  return timePassed >= daysToWait * 24 * 60 * 60 * 1000;
}

async function shouldSendFollowUp(
  intent: Payment_intent,
  followUps: Payment_follow_up[],
  config: { maxFollowUps: number; daysBeforeFollowUp: number },
): Promise<boolean> {
  if (followUps.length >= config.maxFollowUps) return false;

  if (!hasEnoughTimePassed(intent.timestamp, config.daysBeforeFollowUp)) return false;

  if (followUps.length > 0) {
    const lastFollowUp = followUps.sort(
      (a, b) => b.Follow_up_date.getTime() - a.Follow_up_date.getTime(),
    )[0];
    if (!hasEnoughTimePassed(lastFollowUp.Follow_up_date, config.daysBeforeFollowUp)) return false;
  }

  // Check if we recieved any donation from the donor after the payment intent
  const donor = await DAO.donors.getByKID(intent.KID_fordeling);

  const donations = await DAO.donations.getByDonorId(donor.id, intent.timestamp);

  if (donations.length > 0) return false;

  return true;
}

async function processPaymentIntent(intent: Payment_intent): Promise<Payment_intent | null> {
  const paymentAmount = intent.Payment_amount.toNumber();
  const config = getFollowUpConfig(intent.Payment_method, paymentAmount);

  const followUps = await initialpaymentmethod.getFollowUpsForPaymentIntent(intent.Id);

  if (await shouldSendFollowUp(intent, followUps, config)) {
    console.log(
      `Initiating follow-up for payment intent ${intent.Id} (KID: ${intent.KID_fordeling}).`,
    );

    const emailSent = await sendPaymentIntentFollowUp(
      intent.KID_fordeling,
      intent.Payment_amount.toNumber(),
    );

    if (emailSent) {
      await initialpaymentmethod.addPaymentFollowUp(intent.Id, new Date());
      return intent;
    }
  }

  return null;
}

router.post("/initiate-follow-ups", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const paymentIntents = await initialpaymentmethod.getPaymentIntentsFromLastMonth();
    const groupedIntents = groupPaymentIntentsByKID(paymentIntents);

    const followUpPromises = Object.values(groupedIntents).map((intents) =>
      processPaymentIntent(getMostRecentIntent(intents)),
    );

    const followUpResults = await Promise.all(followUpPromises);
    const followUpSent = followUpResults.filter(
      (result): result is Payment_intent => result !== null,
    );

    res.json({
      message: "Follow-up process initiated successfully.",
      followUpSent,
    });
  } catch (ex) {
    next({ ex });
  }
});

router.get("/inflation-reminder", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const eligibleAgreements = await getAllInflationEligibleAgreements();

    const summary = {
      totalEligible: {
        avtaleGiro: eligibleAgreements.avtaleGiro.length,
        autoGiro: eligibleAgreements.autoGiro.length,
        vipps: eligibleAgreements.vipps.length,
        total:
          eligibleAgreements.avtaleGiro.length +
          eligibleAgreements.autoGiro.length +
          eligibleAgreements.vipps.length,
      },
      agreements: eligibleAgreements,
      generated: DateTime.now().toISO(),
    };

    await DAO.logging.add("InflationReminder", summary);

    res.json({
      status: 200,
      content: summary,
    });
  } catch (ex) {
    next({ ex });
  }
});

module.exports = router;
