import { Mailersend_survey_responses } from "@prisma/client";
import { DAO } from "../DAO";

export const mail = {
  saveMailerSendSurveyResponse: async (
    surveyResponse: Omit<Mailersend_survey_responses, "ID" | "timestamp">,
  ) => {
    await DAO.query(
      `
            INSERT INTO Mailersend_survey_responses (surveyID, questionID, DonorID, answer, answerID)
            VALUES (?, ?, ?, ?, ?)
            `,
      [
        surveyResponse.surveyID,
        surveyResponse.questionID,
        surveyResponse.DonorID,
        surveyResponse.answer,
        surveyResponse.answerID,
      ],
    );
  },
  getAllMailerSendSurveyResponses: async (): Promise<Mailersend_survey_responses[]> => {
    const [results] = await DAO.query(
      `SELECT ID, surveyID, questionID, DonorID, answer, answerID, timestamp
       FROM Mailersend_survey_responses
       ORDER BY ID ASC`,
    );
    return results;
  },
};
