import { DateTime } from "luxon";
import { DAO } from "../custom_modules/DAO";
import {
  sendDonationRegistered,
  sendAvtalegiroNotification,
  sendFacebookTaxConfirmation,
  sendTaxYearlyReportNoticeNoUser,
  sendTaxYearlyReportNoticeWithUser,
  sendDonorMissingTaxUnitNotice,
  sendSanitySecurityNotice,
  send100millionsolicitation,
  sendDonorCloseToTaxDeductionTreshold,
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
  /*authMiddleware.isAdmin, */ async (req, res, next) => {
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

router.post(
  "/solicitation/100million",
  /* authMiddleware.isAdmin ,*/ async (req, res, next) => {
    try {
      const email = req.body.email;

      const donors = await DAO.donors.getDonorsWithDonationsBeforeYearButNotAfter(2024);

      const donorSubset = donors.slice(0, 100);

      /*
      for (const donor of donorSubset) {
        // Sleep for 200ms to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
        await send100millionsolicitation(donor.email);
      }
      */

      res.json({
        status: 200,
        content: donorSubset,
      });
    } catch (ex) {
      next(ex);
    }
  },
);

router.post("/mailersend/survey/response", async (req, res, next) => {
  try {
    const surveyResponse = req.body.data as SurveyEmail;

    let DonorID = await DAO.donors.getIDbyEmail(surveyResponse.email.recipient.email);

    if (!DonorID) {
      DonorID = 1464; // Anonymous donor
    }

    if (!surveyResponse.surveys) {
      res.json({
        status: 200,
        content: "No surveys found in email",
      });
      return;
    }

    for (let survey of surveyResponse.surveys) {
      for (let answer of survey.answers) {
        await DAO.mail.saveMailerSendSurveyResponse({
          surveyID: parseInt(survey.survey_id),
          questionID: parseInt(survey.question_id),
          DonorID: DonorID,
          answer: answer.answer,
          answerID: answer.answer_id,
        });
      }
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

router.post("/mailersend/security/sanitynotification", async (req, res, next) => {
  try {
    if (!req.body) {
      res.status(400).json({
        status: 400,
        content: "No request body",
      });
      return;
    }
    if (!req.body.fields || !req.body.document || !req.body.sanityUser) {
      res.status(400).json({
        status: 400,
        content: "Missing required fields in request body",
      });
      return;
    }
    if (!Array.isArray(req.body.fields)) {
      res.status(400).json({
        status: 400,
        content: "Fields must be an array",
      });
      return;
    }
    if (req.body.fields.some((field) => !field.name || !field.prev || !field.new)) {
      res.status(400).json({
        status: 400,
        content: "Missing required property on object in fields array",
      });
      return;
    }

    const variables: SanitySecurityNoticeVariables = {
      document: req.body.document,
      fields: req.body.fields,
      sanityUser: req.body.sanityUser,
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
});

router.get("/taxdeduction/close", authMiddleware.isAdmin, async (req, res, next) => {
  return res.status(403).json({
    status: 403,
    content:
      "Temporarily disabled, main pitfall is that we don't track if we've already sent the email to the donors.",
  });

  if (!req.query.year) {
    res.status(400).json({
      status: 400,
      content: "Missing year query parameter",
    });
    return;
  }
  if (!req.query.min) {
    res.status(400).json({
      status: 400,
      content: "Missing min query parameter",
    });
    return;
  }
  if (!req.query.max) {
    res.status(400).json({
      status: 400,
      content: "Missing max query parameter",
    });
    return;
  }
  const { year, min, max } = req.query;

  if (typeof year !== "string" || isNaN(parseInt(year as string))) {
    res.status(400).json({
      status: 400,
      content: "Year must be a number",
    });
    return;
  }
  if (typeof min !== "string" || isNaN(parseInt(min as string))) {
    res.status(400).json({
      status: 400,
      content: "Min must be a number",
    });
    return;
  }
  if (typeof max !== "string" || isNaN(parseInt(max as string))) {
    res.status(400).json({
      status: 400,
      content: "Max must be a number",
    });
    return;
  }

  const closeToLimit = await DAO.tax.getDonorsCloseToDeductionLimit(
    parseInt(year as string),
    parseInt(min as string),
    parseInt(max as string),
  );

  /*
  for (const donor of closeToLimit) {
    // Note that 500 is the minimum sum for tax deduction in 2024, this may change in the future
    await sendDonorCloseToTaxDeductionTreshold(donor.Donor_ID, donor.total_donations, 500, donor.num_tax_units);
  }
  */

  return res.json({
    status: 200,
    content: closeToLimit,
  });
});

module.exports = router;

// Mailersend survey post body type

type EmailObject = {
  object: string;
  id: string;
  created_at: string;
  from: string;
  subject: string;
  status: string;
  tags: string | null;
  preview_url: string;
  template: {
    object: string;
    id: string;
    url: string;
  };
  message: {
    object: string;
    id: string;
    created_at: string;
  };
  recipient: {
    object: string;
    id: string;
    email: string;
    created_at: string;
  };
};

type Answer = {
  answer: string;
  answer_id: string;
  image?: string;
};

type Rule = {
  $$hashKey: string;
  answered: string;
  collapsed: boolean;
  question_index: number;
  specific_answer: number;
  specific_answer_value: string;
  action: string;
  action_question_index: number;
};

type Survey = {
  survey_location_url: string;
  survey_id: string;
  question_id: string;
  question_index: number;
  question_type: string;
  question: string;
  next_question_index: number;
  answers: Answer[];
  rules: Rule[];
  correct_answers_rate: number;
  is_last_question: boolean;
};

type SurveyEmail = {
  email: EmailObject;
  surveys: Survey[];
};
