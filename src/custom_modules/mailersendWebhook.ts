/**
 * Parses the survey answers out of a MailerSend webhook version 2 payload.
 *
 * Version 1 is legacy and stops working on 2026-12-01. It disagreed with
 * version 2 about all three fields this handler reads:
 *
 *   recipient   v1: data.email.recipient.email (nested)   v2: data.email (string)
 *   surveys     v1: data.surveys                          v2: data.meta.surveys
 *   answers     v1: survey.answers[] of {answer, answer_id}
 *               v2: survey.answer, a single string, with no answer id
 *
 * Nothing overlaps, so the version 1 reader this replaces would have silently
 * dropped every version 2 delivery - it found no `surveys` key and returned
 * success. The webhook is still on version 1 and must be switched to 2 after
 * this deploys; survey answers delivered in between are lost.
 */

export type SurveyAnswerRow = {
  surveyID: number;
  questionID: number;
  answer: string;
  answerID: string;
};

const asString = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

/**
 * Version 2 does not send an answer id, and the column is NOT NULL. Written as
 * a sentinel rather than an empty string so a row that never had one is
 * distinguishable from one that arrived blank. Nothing consumes this column.
 */
const NO_ANSWER_ID = "-1";

export function parseSurveySubmission(data: any): {
  recipientEmail: string | null;
  answers: SurveyAnswerRow[];
} {
  const recipientEmail = typeof data?.email === "string" ? data.email : null;
  const surveys = Array.isArray(data?.meta?.surveys) ? data.meta.surveys : [];

  const answers: SurveyAnswerRow[] = [];

  for (const survey of surveys) {
    const surveyID = Number(survey?.survey_id);
    const questionID = Number(survey?.question_id);

    // Ids arrive as integers in version 2, but guard anyway - NaN would be
    // written straight into the database
    if (!Number.isFinite(surveyID) || !Number.isFinite(questionID)) continue;
    if (survey?.answer === undefined) continue;

    answers.push({
      surveyID,
      questionID,
      answer: asString(survey.answer),
      answerID:
        survey.answer_id === undefined || survey.answer_id === null
          ? NO_ANSWER_ID
          : String(survey.answer_id),
    });
  }

  return { recipientEmail, answers };
}
