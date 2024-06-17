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

router.post("/taxreport/notice", authMiddleware.isAdmin, async (req, res, next) => {
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
});

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

/**
 * {
  "email": {
    "object": "email",
    "id": "643e785e1ad4b461a307e5d2",
    "created_at": "2023-04-18T11:00:46.609000Z",
    "from": "test@domain.com",
    "subject": "Test email",
    "status": "sent",
    "tags": null,
    "preview_url": "http://preview.mailersend.com/email/643e785e1ad4b461a307e5d2",
    "template": {
      "object": "template",
      "id": "83gwk2j7zqz1nxyd",
      "url": "http://app.mailersend.com/templates/83gwk2j7zqz1nxyd"
    },
    "message": {
      "object": "message",
      "id": "643e785d4d8189e0ef046aa2",
      "created_at": "2023-04-18T11:00:45.398000Z"
    },
    "recipient": {
      "object": "recipient",
      "id": "6410951922b6316e210cb2e2",
      "email": "reciepient@email.com",
      "created_at": "2023-03-14T15:39:05.608000Z"
    }
  },
  "surveys": [
    {
      "survey_location_url": "http://preview.mailersend.com/email/643e785e1ad4b461a307e5d2#ml-survey-link-5",
      "survey_id": "4",
      "question_id": "5",
      "question_index": 0,
      "question_type": "intro",
      "question": "We value your feedback.",
      "next_question_index": 1,
      "answers": [
        {
          "answer": "1",
          "answer_id": "1"
        }
      ],
      "rules": [
        {
          "$$hashKey": "object:3113",
          "answered": "answered_specific",
          "collapsed": true,
          "question_index": 1,
          "specific_answer": 1,
          "specific_answer_value": "Very Unsatisfied",
          "action": "skip_to_question",
          "action_question_index": 2
        }
      ],
      "correct_answers_rate": 0,
      "is_last_question": false
    },
    {
      "survey_location_url": "http://preview.mailersend.com/email/643e785e1ad4b461a307e5d2#ml-survey-link-5",
      "survey_id": "4",
      "question_id": "6",
      "question_index": 1,
      "question_type": "satisfaction_scale",
      "question": "How would you rate our new product line?",
      "next_question_index": 2,
      "answers": [
        {
          "answer": "5",
          "answer_id": "5",
          "image": "https://assets.mlcdn.com/ml/images/editor/survey/faces/color/5.png"
        }
      ],
      "rules": [
        {
          "$$hashKey": "object:3113",
          "answered": "answered_specific",
          "collapsed": true,
          "question_index": 1,
          "specific_answer": 1,
          "specific_answer_value": "Very Unsatisfied",
          "action": "skip_to_question",
          "action_question_index": 2
        }
      ],
      "correct_answers_rate": 0,
      "is_last_question": false
    },
    {
      "survey_location_url": "http://preview.mailersend.com/email/643e785e1ad4b461a307e5d2#ml-survey-link-5",
      "survey_id": "4",
      "question_id": "7",
      "question_index": 2,
      "question_type": "rating_scale",
      "question": "How likely are you to recommend our new products to a friend or colleague?",
      "next_question_index": 3,
      "answers": [
        {
          "answer": "2",
          "answer_id": "2"
        }
      ],
      "rules": [
        {
          "$$hashKey": "object:3113",
          "answered": "answered_specific",
          "collapsed": true,
          "question_index": 1,
          "specific_answer": 1,
          "specific_answer_value": "Very Unsatisfied",
          "action": "skip_to_question",
          "action_question_index": 2
        }
      ],
      "correct_answers_rate": 0,
      "is_last_question": true
    }
  ]
}
 * 
 */

router.post("/mailersend/survey/response", async (req, res, next) => {
  try {
    console.log(req.body);

    const surveyResponse = req.body.data as SurveyEmail;

    let DonorID = await DAO.donors.getIDbyEmail(surveyResponse.email.recipient.email);

    if (!DonorID) {
      DonorID = 1464; // Anonymous donor
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
