import { DateTime } from "luxon";
import { DAO } from "../custom_modules/DAO";
import { parseSurveySubmission } from "../custom_modules/mailersendWebhook";
import {
  sendDonationRegistered,
  sendAvtalegiroNotification,
  sendSanitySecurityNotice,
  sendMissingTaxUnitNotice,
} from "../custom_modules/mail";

import express from "express";
import {
  requireMailerSendSignature,
  requireSanityWebhookSignature,
} from "../custom_modules/webhookAuth";
const router = express.Router();
const config = require("../config");
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

router.post("/avtalegiro/notice", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const KID = req.body.KID;
    const agreement = await DAO.avtalegiroagreements.getByKID(KID);

    let claimDate: DateTime;
    const now = DateTime.local();

    if (agreement!.paymentDate > now.day) {
      claimDate = DateTime.local(now.year, now.month, agreement!.paymentDate);
    } else {
      claimDate = DateTime.local(now.year, now.month, agreement!.paymentDate).plus({ month: 1 });
    }

    await sendAvtalegiroNotification(agreement!, claimDate);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/taxreport/notice", authMiddleware.isAdmin, async (req, res, next) => {
  return res.status(501).json({
    status: 501,
    content: "Not implemented",
  });

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
          // TODO: Replace with new mailersend template
          // promises.push(sendTaxYearlyReportNoticeWithUser(report));
        } else if (reportsWithoutUserOnProfilePage.length > 0) {
          const report = reportsWithoutUserOnProfilePage.pop();
          // TODO: Replace with new mailersend template
          // romises.push(sendTaxYearlyReportNoticeNoUser(report));
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

/**
 * Sends a notice to all donors that are eligible for tax deduction in the given year
 * Specify a list of emails to exclude from the notice, a tax year (usually the year before the current year)
 * and a minimum sum for the donations in the given year to qualify for tax deduction (500 for 2023 f.ex.)
 *
 * Optional test parameters:
 * - testEmail: Override recipient email (sends all emails to this address instead)
 * - testLimit: Only send to the first N donors (useful for testing)
 */
router.post("/notice/missingtaxunit", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const { excludedEmails = [], year, minSum, testEmail, testLimit } = req.body;
    if (!year || !minSum) {
      res.status(400).json({
        status: 400,
        content: "Missing parameters year or minSum",
      });
      return;
    }

    let donorsWithDonationsMissingTaxUnit = await DAO.tax.getDonorsEligableForDeductionInYear(
      year,
      minSum,
      excludedEmails,
    );

    console.log(
      `Donors with donations missing tax unit (first 10): ${JSON.stringify(
        donorsWithDonationsMissingTaxUnit.slice(0, 10),
      )}`,
    );

    // Apply test limit if specified
    if (testLimit && typeof testLimit === "number" && testLimit > 0) {
      donorsWithDonationsMissingTaxUnit = donorsWithDonationsMissingTaxUnit.slice(0, testLimit);
      console.log(`TEST MODE: Limited to first ${testLimit} donors`);
    }

    // Log test email override if specified
    if (testEmail) {
      console.log(`TEST MODE: All emails will be sent to ${testEmail}`);
    }

    let successfullySent = 0;
    let failedToSend = 0;
    const totalEmails = donorsWithDonationsMissingTaxUnit.length;
    const allResults: PromiseSettledResult<boolean | number>[] = [];

    console.log(
      `Starting to send missing tax unit notices to ${totalEmails} donors for year ${year}`,
    );

    // Batch send to all donors, maximum 10 at a time
    const MAX_CONCURRENT = 10;
    const donorsQueue = [...donorsWithDonationsMissingTaxUnit];

    while (donorsQueue.length > 0) {
      // Wait 1 second between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const batch = donorsQueue.splice(0, MAX_CONCURRENT);

      console.log(
        `Batch sending ${batch.length} notices (progress: ${
          successfullySent + failedToSend
        }/${totalEmails}) (success: ${successfullySent}) (failed: ${failedToSend})...`,
      );

      const promises = batch.map((donor) => {
        // If testEmail is provided, override the donor's email for testing
        return sendMissingTaxUnitNotice(donor, year, testEmail || donor.email);
      });
      const batchResults = await Promise.allSettled(promises);

      batchResults.forEach((result) => {
        allResults.push(result);
        if (result.status === "fulfilled" && result.value === true) {
          successfullySent++;
        } else {
          failedToSend++;
          if (result.status === "rejected") {
            console.error("Failed to send", result.reason);
          } else {
            console.error("Failed to send, returned:", result.value);
          }
        }
      });
    }

    console.log(
      `Finished sending missing tax unit notices. Success: ${successfullySent}, Failed: ${failedToSend}`,
    );

    res.json({
      status: 200,
      content: {
        total: totalEmails,
        success: successfullySent,
        failed: failedToSend,
        testMode: !!(testEmail || testLimit),
      },
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * MailerSend survey_submitted webhook. Requests must be signed with the webhook's signing
 * secret (MAILERSEND_SURVEY_WEBHOOK_SECRET).
 */
const verifySurveyWebhook = requireMailerSendSignature(
  () => config.mailersend_survey_webhook_secret,
  "MAILERSEND_SURVEY_WEBHOOK_SECRET",
);

router.post("/mailersend/survey/response", verifySurveyWebhook, async (req, res, next) => {
  try {
    const { recipientEmail, answers } = parseSurveySubmission(req.body?.data);

    let DonorID = recipientEmail ? await DAO.donors.getIDbyEmail(recipientEmail) : null;

    if (!DonorID) {
      DonorID = 1464; // Anonymous donor
    }

    if (answers.length === 0) {
      /**
       * A survey_submitted delivery with no parseable answers means the payload
       * is not the shape expected. Log what did arrive - the previous handler
       * hit this branch for every version 2 delivery and reported success,
       * which is exactly how a format change goes unnoticed.
       */
      console.error(
        "MailerSend survey webhook produced no answers. data keys: " +
          `[${Object.keys(req.body?.data ?? {}).join(", ")}], ` +
          `data.meta keys: [${Object.keys(req.body?.data?.meta ?? {}).join(", ")}]`,
      );
      res.json({
        status: 200,
        content: "No surveys found in email",
      });
      return;
    }

    for (const answer of answers) {
      await DAO.mail.saveMailerSendSurveyResponse({
        surveyID: answer.surveyID,
        questionID: answer.questionID,
        DonorID: DonorID,
        answer: answer.answer,
        answerID: answer.answerID,
      });
    }

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * Sends email when a sensitive field in sanity is updated
 */
export type SanitySecurityNoticeVariables = {
  document: string;
  fields: {
    name: string;
    prev: string;
    new: string;
  }[];
  sanityUser: string;
};

const verifySanitySecurityWebhook = requireSanityWebhookSignature(
  () => config.sanity_security_webhook_secret,
  "SANITY_SECURITY_WEBHOOK_SECRET",
);

const fieldValue = (value: unknown) => (value == null ? "" : String(value));

/**
 * A Sanity webhook (signed, see requireSanityWebhookSignature) on publishing a bank document (the
 * webhook also matches the former autogiro type) whose account number changed. The webhook's projection sends the document type, the
 * user and every watched field with its value before and after; fields that did not change are
 * left out of the email.
 */
router.post(
  "/mailersend/security/sanitynotification",
  verifySanitySecurityWebhook,
  async (req, res, next) => {
    try {
      const body = req.body;
      if (
        !body ||
        typeof body.document !== "string" ||
        !body.document ||
        !body.sanityUser ||
        !Array.isArray(body.fields) ||
        body.fields.length > 50 ||
        body.fields.some((field) => !field || typeof field.name !== "string" || !field.name)
      ) {
        res.status(400).json({
          status: 400,
          content: "Missing or invalid fields in request body",
        });
        return;
      }

      const fields = body.fields
        .map((field) => ({
          name: field.name,
          prev: fieldValue(field.prev),
          new: fieldValue(field.new),
        }))
        .filter((field) => field.prev !== field.new);

      if (fields.length === 0) {
        res.json({ status: 200, content: "No sensitive field changed" });
        return;
      }

      const variables: SanitySecurityNoticeVariables = {
        document: body.document,
        fields,
        sanityUser: String(body.sanityUser),
      };

      const success = await sendSanitySecurityNotice(variables);

      if (success) {
        res.json({
          status: 200,
          content: "OK",
        });
      } else {
        res.status(500).json({
          status: 500,
          content: "Failed to send email",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
);

module.exports = router;
