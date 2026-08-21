import { expect } from "chai";
import { parseSurveySubmission } from "../custom_modules/mailersendWebhook";

/**
 * The version 2 payload shape for activity.survey_submitted, per MailerSend's
 * documented example. Answers live under data.meta.surveys, the recipient is a
 * plain string on data.email, and each survey carries a single answer with no
 * answer id - the parser substitutes -1 for the missing id.
 */
const version2Payload = {
  id: "68929fd47f916891ef12eba9",
  domain_id: "7nxe3yjmeq28vp0k",
  message_id: "68929fd402fd7079a02cf858",
  type: "survey_submitted",
  subject: "Donasjon mottatt",
  email: "donor@example.com",
  tags: ["receipt"],
  meta: {
    surveys: [
      { question_id: 1, survey_id: 2, answer: "Ja", is_last_question: false },
      { question_id: 3, survey_id: 2, answer: "Nei", is_last_question: true },
    ],
  },
};

describe("parseSurveySubmission", function () {
  it("reads the recipient and every answer from a version 2 payload", function () {
    const { recipientEmail, answers } = parseSurveySubmission(version2Payload);

    expect(recipientEmail).to.equal("donor@example.com");
    expect(answers).to.deep.equal([
      { surveyID: 2, questionID: 1, answer: "Ja", answerID: "-1" },
      { surveyID: 2, questionID: 3, answer: "Nei", answerID: "-1" },
    ]);
  });

  /**
   * The shape the previous handler expected. It must not parse, so that the
   * route logs the mismatch instead of writing half a row.
   */
  it("yields nothing for a version 1 payload", function () {
    const { recipientEmail, answers } = parseSurveySubmission({
      email: { recipient: { email: "donor@example.com" } },
      surveys: [{ survey_id: "2", question_id: "1", answers: [{ answer: "Ja", answer_id: "a1" }] }],
    });

    expect(recipientEmail).to.equal(null);
    expect(answers).to.be.empty;
  });

  it("skips surveys with unusable ids rather than writing NaN", function () {
    const { answers } = parseSurveySubmission({
      email: "donor@example.com",
      meta: {
        surveys: [
          { question_id: "not a number", survey_id: 2, answer: "Ja" },
          { question_id: 1, survey_id: 2, answer: "Ja" },
        ],
      },
    });

    expect(answers).to.have.lengthOf(1);
    expect(answers[0].questionID).to.equal(1);
  });

  it("skips surveys with no answer", function () {
    const { answers } = parseSurveySubmission({
      email: "donor@example.com",
      meta: { surveys: [{ question_id: 1, survey_id: 2, is_last_question: true }] },
    });

    expect(answers).to.be.empty;
  });

  it("keeps an empty answer string rather than dropping the row", function () {
    const { answers } = parseSurveySubmission({
      email: "donor@example.com",
      meta: { surveys: [{ question_id: 1, survey_id: 2, answer: "" }] },
    });

    expect(answers).to.have.lengthOf(1);
    expect(answers[0].answer).to.equal("");
  });

  it("survives a payload with nothing useful in it", function () {
    expect(parseSurveySubmission(undefined)).to.deep.equal({
      recipientEmail: null,
      answers: [],
    });
    expect(parseSurveySubmission({ meta: { surveys: "not an array" } }).answers).to.be.empty;
  });
});
