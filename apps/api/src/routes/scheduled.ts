import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendPaymentIntentFollowUp } from "../custom_modules/mail";
import { DAO } from "../custom_modules/DAO";
import { getDueDates } from "../custom_modules/avtalegiro";
import { excludeAgreementsClaimedThisMonth } from "../custom_modules/avtalegiro/charges";
import * as avtalegiroDeletions from "../custom_modules/avtalegiro/deletions";
import { checkIfAcceptedReciept, getLatestOCRFile, sendFile } from "../custom_modules/nets";
import { DateTime } from "luxon";
import mailchimp from "@mailchimp/mailchimp_marketing";

import express from "express";
import { createAutoGiroShipment } from "../custom_modules/autogiro";
import fetch from "node-fetch";
import { initialpaymentmethod } from "../custom_modules/DAO_modules/initialpaymentmethod";
import paymentMethods from "../enums/paymentMethods";
import { Payment_follow_up, Payment_intent } from "@prisma/client";
import { getAllInflationEligibleAgreements } from "../custom_modules/inflationadjustment";
import { RequestLocale } from "../middleware/locale";
import { enqueueInvalidTransactions } from "../custom_modules/reviewQueue";

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

    const importLogId = await DAO.logging.add("OCR", result);
    await enqueueInvalidTransactions(
      "ocr",
      addedDonations.invalidTransactions,
      typeof importLogId === "number" ? importLogId : null,
    );
    res.json(result);
  } catch (ex) {
    next({ ex });
  }
});

/**
 * Claims the active AvtaleGiro agreements due on a date and sends the claims file.
 * Agreements already claimed this month are skipped, so moving the payment date after a claim
 * doesn't charge the donor twice. The claims are recorded before the file is sent, so we never
 * send a claim without a record of it.
 * @param today The day the claims are sent
 * @param claimDate The due date being claimed
 * @param notify Whether to notify donors who asked for notice of each claim
 */
async function claimAvtaleGiroAgreements(today: DateTime, claimDate: DateTime, notify: boolean) {
  const isClaimDateLastDayOfMonth = claimDate.day == claimDate.endOf("month").day;

  /**
   * Get active agreements
   */
  let agreements = await DAO.avtalegiroagreements.getByPaymentDate(claimDate.day);
  if (isClaimDateLastDayOfMonth) {
    agreements = [...agreements, ...(await DAO.avtalegiroagreements.getByPaymentDate(0))];
  }
  agreements = agreements.filter((agreement) => agreement.amount > 0);

  const claimedKIDs = await DAO.avtalegirocharges.getClaimedKIDsForMonth(claimDate);
  const { toClaim, alreadyClaimed } = excludeAgreementsClaimedThisMonth(agreements, claimedKIDs);
  const alreadyClaimedKIDs = alreadyClaimed.map((agreement) => agreement.KID);

  if (toClaim.length === 0) {
    return { notifiedAgreements: null, file: null, alreadyClaimedKIDs };
  }

  /**
   * Notify agreements to be charged
   */
  let notifiedAgreements = {
    success: 0,
    failed: 0,
  };
  if (notify) {
    notifiedAgreements = await avtalegiro.notifyAgreements(
      toClaim.filter((agreement) => agreement.notice == true),
      claimDate,
    );
  }

  /**
   * Create file to charge agreements for current day
   */
  const shipmentID = await DAO.avtalegiroagreements.addShipment(toClaim.length);
  await DAO.avtalegirocharges.addCharges(shipmentID, toClaim, claimDate);
  const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(
    shipmentID,
    toClaim,
    claimDate,
  );

  /**
   * Send file to nets
   */
  const filename =
    "DIRREM" + today.toFormat("ddLLyy") + "." + claimDate.toFormat("ddLLyy") + "." + shipmentID;
  await sendFile(avtaleGiroClaimsFile, filename);

  return {
    notifiedAgreements,
    file: avtaleGiroClaimsFile.toString(),
    alreadyClaimedKIDs,
  };
}

/**
 * Sends deletion requests for claims on cancelled agreements. Failures are logged, so they never
 * stop the claims from being sent.
 */
async function processAvtaleGiroDeletions(now: DateTime, requeueUnconfirmed: boolean) {
  try {
    const result = await avtalegiroDeletions.processAvtaleGiroDeletions(now, requeueUnconfirmed);
    await DAO.logging.add("AvtaleGiro - Deletions", result);
  } catch (ex) {
    console.error("Failed to process AvtaleGiro deletions", ex);
  }
}

/**
 * Triggered by a google cloud scheduler webhook every day at 10:00
 */
router.post("/avtalegiro", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let today;
    if (req.query.date) {
      today = DateTime.fromJSDate(new Date(req.query.date));
    } else {
      today = DateTime.fromJSDate(new Date());
    }

    await processAvtaleGiroDeletions(today, false);

    const claimDates = getDueDates(today);
    for (let claimDate of claimDates) {
      const result = await claimAvtaleGiroAgreements(today, claimDate, !!req.query.notify);
      await DAO.logging.add("AvtaleGiro", result);
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
  try {
    let today: DateTime;
    if (req.query.date) {
      today = DateTime.fromJSDate(new Date(req.query.date));
    } else {
      today = DateTime.fromJSDate(new Date());
    }

    await processAvtaleGiroDeletions(today, true);

    const claimDates = getDueDates(today);

    // Shipments sent before charges were recorded (only on the day of the deploy) can't be
    // matched to a claim date, so we can't tell which were accepted. Sending them again could
    // charge donors twice, so the retry is skipped and the shipments are logged for a manual check.
    if (claimDates.length > 0) {
      const untrackedShipmentIDs = await DAO.avtalegirocharges.getUntrackedShipmentIDs(today);
      if (untrackedShipmentIDs.length > 0) {
        await DAO.logging.add("AvtaleGiro - Retry", {
          skipped: "Shipments sent before charges were recorded. Check their receipts manually.",
          untrackedShipmentIDs,
        });
        res.send("OK");
        return;
      }
    }

    for (let claimDate of claimDates) {
      /**
       * Check if we have recieved an "accepted" reciept from MasterCard (Nets) for any of
       * today's shipments for the claim date. If not, we should retry and send the claims again
       */
      const shipmentIDs = await DAO.avtalegirocharges.getShipmentIDsForDueDate(claimDate, today);

      let accepted = false;
      for (const shipmentID of shipmentIDs) {
        if (await checkIfAcceptedReciept(shipmentID)) {
          accepted = true;
          break;
        }
      }
      if (accepted) continue;

      // The claims in the unaccepted shipments are sent again in a new shipment. If there is no
      // shipment, something went wrong before it was recorded, and nothing was sent.
      await DAO.avtalegirocharges.supersedeShipments(shipmentIDs);

      const result = await claimAvtaleGiroAgreements(today, claimDate, false);
      await DAO.logging.add("AvtaleGiro - Retry", result);
    }
    res.send("OK");
  } catch (ex) {
    console.error(ex);
    next({ ex });
  }
});

router.post("/autogiro", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const result = await createAutoGiroShipment();
    // await sendOcrBackup(JSON.stringify(result, null, 2));
    res.json({
      status: 200,
      content: result,
    });
  } catch (ex) {
    next({ ex });
  }
});

/**
 * Daily Vipps recurring job: synchronizes agreements and charges from Vipps, then creates the
 * charges that fall due. Failures for single agreements do not stop the others, but are logged
 * and make the response a 500 so the scheduler reports the run as failed.
 *
 * The two steps are also available separately (/vipps/sync and /vipps/charges), as the sync
 * alone can take several minutes.
 */
router.post("/vipps", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    // Synchronize effektDB with Vipps database before creating daily charges
    const sync = await vipps.synchronizeVippsAgreementDatabase();

    // Creates charges for all Vipps recurring agreements that are due three days ahead
    const charges = await vipps.createFutureDueCharges();

    const result = { ...charges, sync };
    await DAO.logging.add("VippsRecurring", result);

    res.status(sync.failed.length > 0 || charges.failed.length > 0 ? 500 : 200).json(result);
  } catch (ex) {
    next({ ex });
  }
});

router.post("/vipps/sync", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const result = await vipps.synchronizeVippsAgreementDatabase();
    await DAO.logging.add("VippsSync", result);

    res.status(result.failed.length > 0 ? 500 : 200).json(result);
  } catch (ex) {
    next({ ex });
  }
});

router.post("/vipps/charges", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const result = await vipps.createFutureDueCharges();
    await DAO.logging.add("VippsRecurring", result);

    res.status(result.failed.length > 0 ? 500 : 200).json(result);
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
  let failures: any[] = [];

  try {
    let members: any[] = [];
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

    let donors: any[] = [];
    let page = 0;
    while (true) {
      // getAll requires a sort since the donor list rewrite (2025-05-09); passing null made
      // every sync fail from then on.
      const newDonors = await DAO.donors.getAll(
        { id: "id", desc: false },
        page,
        count,
        null,
        RequestLocale.NO,
      );
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
    // Record what went wrong (the log used to keep only the counters) and answer the
    // scheduler, which otherwise waits until it times out.
    console.error("Mailchimp sync failed", ex);
    try {
      await DAO.logging.add("(Failed - Partial) Mailchimp sync", {
        error: ex instanceof Error ? ex.message : String(ex),
        addedToMailchimp,
        addedToDonor,
        removedFromDonor,
        removedFromMailchimp,
        failures,
      });
    } catch (loggingException) {
      console.error(loggingException);
    }
    next(ex);
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

  const users: any[] = [];

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

  const promises: Promise<any>[] = [];
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
  const mismatchedUsers: { userId: any; email: string; reason: string }[] = [];

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

  res.json({
    status: 200,
    content: result,
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
  return paymentIntents.reduce(
    (acc, intent) => {
      const kid = intent.KID_fordeling!;
      if (!acc[kid]) {
        acc[kid] = [];
      }
      acc[kid].push(intent);
      return acc;
    },
    {} as Record<string, Payment_intent[]>,
  );
}

function getMostRecentIntent(intents: Payment_intent[]): Payment_intent {
  return intents.reduce((latest, current) =>
    current.timestamp! > latest.timestamp! ? current : latest,
  );
}

function getFollowUpConfig(paymentMethod: number | null, paymentAmount: number) {
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

  if (!hasEnoughTimePassed(intent.timestamp!, config.daysBeforeFollowUp)) return false;

  if (followUps.length > 0) {
    const lastFollowUp = followUps.sort(
      (a, b) => b.Follow_up_date.getTime() - a.Follow_up_date.getTime(),
    )[0];
    if (!hasEnoughTimePassed(lastFollowUp.Follow_up_date, config.daysBeforeFollowUp)) return false;
  }

  // Check if we recieved any donation from the donor after the payment intent
  const donor = await DAO.donors.getByKID(intent.KID_fordeling);

  const donations = await DAO.donations.getByDonorId(donor!.id, intent.timestamp!);

  if (donations.length > 0) return false;

  return true;
}

async function processPaymentIntent(intent: Payment_intent): Promise<Payment_intent | null> {
  const paymentAmount = intent.Payment_amount!.toNumber();
  const config = getFollowUpConfig(intent.Payment_method, paymentAmount);

  const followUps = await initialpaymentmethod.getFollowUpsForPaymentIntent(intent.Id);

  if (await shouldSendFollowUp(intent, followUps, config)) {
    console.log(
      `Initiating follow-up for payment intent ${intent.Id} (KID: ${intent.KID_fordeling}).`,
    );

    const emailSent = await sendPaymentIntentFollowUp(
      intent.KID_fordeling!,
      intent.Payment_amount!.toNumber(),
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
