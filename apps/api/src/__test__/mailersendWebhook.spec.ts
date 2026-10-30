import { expect } from "chai";
import { parseSurveySubmission } from "../custom_modules/mailersendWebhook";

/**
 * The version 2 payload for activity.survey_submitted, copied from MailerSend's
 * documented example. The recipient is a plain string on data.recipient, the
 * surveys sit under data.meta.surveys, and each survey carries an answers array
 * of {answer, answer_id} - the same answer objects version 1 sends.
 */
const version2Payload = {
  id: "68929fd47f916891ef12eba9",
  domain_id: "7nxe3yjmeq28vp0k",
  message_id: "68929fd402fd7079a02cf858",
  email_id: "68929fd47f916891ef12eba9",
  type: "survey_submitted",
  subject: "Donasjon mottatt",
  recipient: "donor@example.com",
  tags: ["receipt"],
  meta: {
    surveys: [
      {
        survey_location_url: "http://preview.mailersend.com/email/68929fd4#ml-survey-link-5",
        survey_id: 4,
        question_id: 5,
        question_index: 0,
        question_type: "rating",
        question: "How would you rate our service?",
        next_question_index: 1,
        answers: [{ answer: "Very satisfied", answer_id: "5" }],
        correct_answers_rate: 0,
        is_last_question: true,
      },
    ],
  },
};

/**
 * The version 1 shape. It is legacy and stops working on 2026-12-01, but the
 * parser still reads it so that a format switch in either direction cannot
 * silently drop responses.
 */
const version1Payload = {
  email: { recipient: { email: "donor@example.com" } },
  surveys: [
    {
      survey_id: "4",
      question_id: "5",
      answers: [{ answer: "Very satisfied", answer_id: "5" }],
    },
  ],
};

describe("parseSurveySubmission", function () {
  it("reads the recipient and every answer from a version 2 payload", function () {
    const { recipientEmail, answers } = parseSurveySubmission(version2Payload);

    expect(recipientEmail).to.equal("donor@example.com");
    expect(answers).to.deep.equal([
      { surveyID: 4, questionID: 5, answer: "Very satisfied", answerID: "5" },
    ]);
  });

  it("reads a version 1 payload identically", function () {
    expect(parseSurveySubmission(version1Payload)).to.deep.equal(
      parseSurveySubmission(version2Payload),
    );
  });

  it("reads every answer when a survey carries more than one", function () {
    const { answers } = parseSurveySubmission({
      recipient: "donor@example.com",
      meta: {
        surveys: [
          {
            survey_id: 2,
            question_id: 1,
            answers: [
              { answer: "Ja", answer_id: "a1" },
              { answer: "Nei", answer_id: "a2" },
            ],
          },
          { survey_id: 2, question_id: 3, answers: [{ answer: "Kanskje", answer_id: "a3" }] },
        ],
      },
    });

    expect(answers).to.deep.equal([
      { surveyID: 2, questionID: 1, answer: "Ja", answerID: "a1" },
      { surveyID: 2, questionID: 1, answer: "Nei", answerID: "a2" },
      { surveyID: 2, questionID: 3, answer: "Kanskje", answerID: "a3" },
    ]);
  });

  it("skips surveys with unusable ids rather than writing NaN", function () {
    const { answers } = parseSurveySubmission({
      recipient: "donor@example.com",
      meta: {
        surveys: [
          {
            question_id: "not a number",
            survey_id: 2,
            answers: [{ answer: "Ja", answer_id: "1" }],
          },
          { question_id: 1, survey_id: 2, answers: [{ answer: "Ja", answer_id: "1" }] },
        ],
      },
    });

    expect(answers).to.have.lengthOf(1);
    expect(answers[0].questionID).to.equal(1);
  });

  it("skips a survey with no answers array", function () {
    const { answers } = parseSurveySubmission({
      recipient: "donor@example.com",
      meta: { surveys: [{ question_id: 1, survey_id: 2, is_last_question: true }] },
    });

    expect(answers).to.be.empty;
  });

  it("keeps an empty answer string rather than dropping the row", function () {
    const { answers } = parseSurveySubmission({
      recipient: "donor@example.com",
      meta: {
        surveys: [{ question_id: 1, survey_id: 2, answers: [{ answer: "", answer_id: "1" }] }],
      },
    });

    expect(answers).to.have.lengthOf(1);
    expect(answers[0].answer).to.equal("");
  });

  it("writes an empty answer id rather than dropping the row", function () {
    const { answers } = parseSurveySubmission({
      recipient: "donor@example.com",
      meta: { surveys: [{ question_id: 1, survey_id: 2, answers: [{ answer: "Ja" }] }] },
    });

    expect(answers).to.deep.equal([{ surveyID: 2, questionID: 1, answer: "Ja", answerID: "" }]);
  });

  it("survives a payload with nothing useful in it", function () {
    expect(parseSurveySubmission(undefined)).to.deep.equal({
      recipientEmail: null,
      answers: [],
    });
    expect(parseSurveySubmission({ meta: { surveys: "not an array" } }).answers).to.be.empty;
  });
});
