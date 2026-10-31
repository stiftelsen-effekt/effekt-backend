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
  /**
   * Checks that a stopped-agreement feedback record exists and belongs to an agreement with the given KID
   */
  async getStoppedAgreementReasonRecordExistsForKID(id: number, KID: string): Promise<boolean> {
    const [result] = await DAO.query(
      `
      SELECT R.ID FROM Recurring_agreement_stopped R
        LEFT JOIN Avtalegiro_agreements A ON R.avtalegiroAgreementID = A.ID
        LEFT JOIN AutoGiro_agreements G ON R.autoGiroAgreementID = G.ID
        LEFT JOIN Vipps_agreements V ON R.vippsAgreementID = V.ID
      WHERE R.ID = ? AND (A.KID = ? OR G.KID = ? OR V.KID = ?)
    `,
      [id, KID, KID, KID],
    );
    return result.length > 0;
  },
  /**
   * Checks that the given agreement (by type and id) has the given KID
   */
  async agreementBelongsToKID(
    agreementType: string,
    agreementId: string,
    KID: string,
  ): Promise<boolean> {
    let table: string;
    switch (agreementType) {
      case "AvtaleGiro":
        table = "Avtalegiro_agreements";
        break;
      case "AutoGiro":
        table = "AutoGiro_agreements";
        break;
      case "Vipps":
        table = "Vipps_agreements";
        break;
      default:
        return false;
    }
    const [result] = await DAO.query(`SELECT ID FROM ${table} WHERE ID = ? AND KID = ?`, [
      agreementId,
      KID,
    ]);
    return result.length > 0;
  },
  async getStoppedAgreementReasonRecordForAgreementWithin24Hours(
    agreementId: string,
    reasonId: number,
    agreementType: string,
  ): Promise<number | null | undefined> {
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
