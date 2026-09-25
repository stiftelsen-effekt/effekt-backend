/**
 * Parses the survey answers out of a MailerSend activity.survey_submitted
 * webhook payload.
 *
 * Version 1 is legacy and stops working on 2026-12-01. It differs from
 * version 2 only in where the two containers sit - the answer objects
 * themselves are identical in both:
 *
 *   recipient   v1: data.email.recipient.email   v2: data.recipient (string)
 *   surveys     v1: data.surveys                 v2: data.meta.surveys
 *   answers     both: survey.answers[] of {answer, answer_id}
 *
 * Both are read here. The webhook is configured for version 2, but a reader
 * that only understands the configured version turns any future format switch
 * into silent data loss, which is exactly how the previous two outages
 * happened.
 */

export type SurveyAnswerRow = {
  surveyID: number;
  questionID: number;
  answer: string;
  answerID: string;
};

const asString = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

export function parseSurveySubmission(data: any): {
  recipientEmail: string | null;
  answers: SurveyAnswerRow[];
} {
  // v2 sends a plain string; v1 nests it under the email object.
  const recipient =
    typeof data?.recipient === "string"
      ? data.recipient
      : typeof data?.email?.recipient?.email === "string"
      ? data.email.recipient.email
      : null;

  const surveys = Array.isArray(data?.meta?.surveys)
    ? data.meta.surveys
    : Array.isArray(data?.surveys)
    ? data.surveys
    : [];

  const answers: SurveyAnswerRow[] = [];

  for (const survey of surveys) {
    const surveyID = Number(survey?.survey_id);
    const questionID = Number(survey?.question_id);

    // v2 sends these as integers and v1 as strings, so both go through Number.
    // Guard anyway - NaN would be written straight into the database.
    if (!Number.isFinite(surveyID) || !Number.isFinite(questionID)) continue;
    if (!Array.isArray(survey?.answers)) continue;

    for (const answer of survey.answers) {
      if (answer?.answer === undefined || answer?.answer === null) continue;

      answers.push({
        surveyID,
        questionID,
        answer: asString(answer.answer),
        answerID: asString(answer.answer_id),
      });
    }
  }

  return { recipientEmail: recipient, answers };
}
