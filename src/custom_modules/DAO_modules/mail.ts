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
};
