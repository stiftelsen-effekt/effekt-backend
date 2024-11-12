import { Recurring_agreement_stopped_reasons } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";

export const agreementfeedback = {
  async getAllStoppedAgreementReasons(): Promise<Recurring_agreement_stopped_reasons[]> {
    const [result] = await DAO.query<SqlResult<Recurring_agreement_stopped_reasons>[]>(`
      SELECT * FROM Recurring_agreement_stopped_reasons
    `);
    return result;
  },
  async addStoppedAgreementReasonRecord(
    reasonId: number,
    avtaleGiroAgreementId: number | null,
    autogiroAgreementId: number | null,
    vippsAgreementId: string | null,
  ): Promise<number> {
    if (!avtaleGiroAgreementId && !autogiroAgreementId && !vippsAgreementId) {
      throw new Error("At least one agreement id must be provided");
    }
    const [result] = await DAO.query(
      `
      INSERT INTO Recurring_agreement_stopped_reasons (reasonID, avtaleGiroAgreementID, autogiroAgreementID, vippsAgreementID)
      VALUES (?, ?, ?, ?)
    `,
      [reasonId, avtaleGiroAgreementId, autogiroAgreementId, vippsAgreementId],
    );
    return result.affectedRows > 0 ? result.insertId : -1;
  },
};
