import { Recurring_agreement_stopped_reasons } from "@prisma/client";
import { DAO, SqlResult } from "../DAO";

export const agreementfeedback = {
  async getAllStoppedAgreementReasons(): Promise<Recurring_agreement_stopped_reasons[]> {
    const [result] = await DAO.query<SqlResult<Recurring_agreement_stopped_reasons>[]>(`
      SELECT * FROM Recurring_agreement_stopped_reasons
      ORDER BY \`order\` ASC
    `);
    return result.map(mapStoppedReason);
  },
  async getStoppedAgreementReasonById(
    id: number,
  ): Promise<Recurring_agreement_stopped_reasons | null> {
    const [result] = await DAO.query<SqlResult<Recurring_agreement_stopped_reasons>[]>(
      `
      SELECT * FROM Recurring_agreement_stopped_reasons
      WHERE ID = ?
    `,
      [id],
    );
    return result.length > 0 ? mapStoppedReason(result[0]) : null;
  },
  async addStoppedAgreementReasonRecord(
    reasonId: number,
    avtaleGiroAgreementId: number | null,
    autogiroAgreementId: number | null,
    vippsAgreementId: string | null,
    otherComment: string | null,
  ): Promise<number> {
    if (!avtaleGiroAgreementId && !autogiroAgreementId && !vippsAgreementId) {
      throw new Error("At least one agreement id must be provided");
    }
    const [result] = await DAO.query(
      `
      INSERT INTO Recurring_agreement_stopped (reasonID, avtaleGiroAgreementID, autogiroAgreementID, vippsAgreementID, otherComment)
      VALUES (?, ?, ?, ?, ?)
    `,
      [reasonId, avtaleGiroAgreementId, autogiroAgreementId, vippsAgreementId, otherComment],
    );
    return result.affectedRows > 0 ? result.insertId : -1;
  },
  async updateStoppedAgreementReasonRecord(
    id: number,
    reasonId: number,
    avtaleGiroAgreementId: number | null,
    autogiroAgreementId: number | null,
    vippsAgreementId: string | null,
    otherComment: string | null,
  ): Promise<number> {
    if (!avtaleGiroAgreementId && !autogiroAgreementId && !vippsAgreementId) {
      throw new Error("At least one agreement id must be provided");
    }
    const [result] = await DAO.query(
      `
      UPDATE Recurring_agreement_stopped
      SET reasonID = ?, avtaleGiroAgreementID = ?, autogiroAgreementID = ?, vippsAgreementID = ?, otherComment = ?
      WHERE ID = ?
    `,
      [reasonId, avtaleGiroAgreementId, autogiroAgreementId, vippsAgreementId, otherComment, id],
    );
    return result.affectedRows > 0 ? id : -1;
  },
  async deleteStoppedAgreementReasonRecord(id: number): Promise<number> {
    const [result] = await DAO.query(
      `
      DELETE FROM Recurring_agreement_stopped
      WHERE ID = ?
    `,
      [id],
    );
    return result.affectedRows > 0 ? id : -1;
  },
  async getStoppedAgreementReasonRecordExists(id: number): Promise<boolean> {
    const [result] = await DAO.query(
      `
      SELECT * FROM Recurring_agreement_stopped
      WHERE ID = ?
    `,
      [id],
    );
    return result.length > 0;
  },
  async getStoppedAgreementReasonRecordForAgreementWithin24Hours(
    agreementId: string,
    reasonId: number,
    agreementType: string,
  ): Promise<number | null> {
    if (agreementType === "Vipps") {
      const [result] = await DAO.query<SqlResult<Recurring_agreement_stopped_reasons>[]>(
        `
      SELECT ID FROM Recurring_agreement_stopped
      WHERE vippsAgreementID = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR) AND reasonID = ?
    `,
        [agreementId, reasonId],
      );
      return result.length > 0 ? result[0].ID : null;
    } else if (agreementType === "AvtaleGiro") {
      const [result] = await DAO.query<SqlResult<Recurring_agreement_stopped_reasons>[]>(
        `
      SELECT ID FROM Recurring_agreement_stopped
      WHERE avtalegiroAgreementID = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR) AND reasonID = ?
    `,
        [agreementId, reasonId],
      );
      return result.length > 0 ? result[0].ID : null;
    } else if (agreementType === "AutoGiro") {
      const [result] = await DAO.query<SqlResult<Recurring_agreement_stopped_reasons>[]>(
        `
      SELECT ID FROM Recurring_agreement_stopped
      WHERE autoGiroAgreementID = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR) AND reasonID = ?
    `,
        [agreementId, reasonId],
      );
      return result.length > 0 ? result[0].ID : null;
    }
  },
};

const mapStoppedReason = (
  reason: SqlResult<Recurring_agreement_stopped_reasons>,
): Recurring_agreement_stopped_reasons => {
  return {
    ID: reason.ID,
    name: reason.name,
    isOther: reason.isOther === 1,
    order: reason.order,
  };
};
