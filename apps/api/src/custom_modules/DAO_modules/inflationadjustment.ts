import { DAO, SqlResult } from "../DAO";
import { DateTime } from "luxon";
import crypto from "crypto";
import { Agreement_inflation_adjustments, Prisma } from "@prisma/client";

export interface AgreementInflationAdjustment {
  ID: number;
  agreement_ID: string;
  agreement_type: "avtaleGiro" | "autoGiro" | "vipps";
  /** In øre */
  current_amount: number;
  /** In øre */
  proposed_amount: number;
  inflation_percentage: number;
  token: string;
  status: "new" | "pending" | "accepted" | "rejected" | "expired";
  created: Date;
  updated: Date | null;
  expires: Date;
}

export interface CreateAdjustmentInput {
  agreementId: string | number;
  agreementType: "avtaleGiro" | "autoGiro" | "vipps";
  currentAmount: number;
  proposedAmount: number;
  inflationPercentage: number;
}

// `expires` is written by the app (UTC wall clock), so it is compared with UTC_TIMESTAMP(): NOW() is
// the DB session's clock (UTC+2 in production), which made proposals expire two hours early.
// `created` and `updated` are filled by MySQL and hold the session clock; see docs/timestamps.md.
export const inflationadjustments = {
  /**
   * Create a new adjustment proposal
   */
  createAdjustment: async function (input: CreateAdjustmentInput): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiryDate = DateTime.now().plus({ days: 30 });

    // Convert amounts to øre (cents)
    const currentAmountOre = input.currentAmount;
    const proposedAmountOre = input.proposedAmount;

    const [result] = await DAO.query(
      `INSERT INTO Agreement_inflation_adjustments 
        (agreement_ID, agreement_type, current_amount, proposed_amount, 
         inflation_percentage, token, status, expires)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
      [
        input.agreementId.toString(),
        input.agreementType,
        currentAmountOre,
        proposedAmountOre,
        input.inflationPercentage,
        token,
        expiryDate.toJSDate(),
      ],
    );

    return token;
  },

  /**
   * Get an adjustment by its token
   */
  getByToken: async function (token: string): Promise<AgreementInflationAdjustment | null> {
    const [adjustments] = await DAO.query<AgreementInflationAdjustment[]>(
      `SELECT * FROM Agreement_inflation_adjustments WHERE token = ?`,
      [token],
    );

    return adjustments?.[0] || null;
  },

  /**
   * Set an adjustment to pending
   */
  setPending: async function (id: number): Promise<boolean> {
    const [result] = await DAO.query(
      `UPDATE Agreement_inflation_adjustments 
       SET status = 'pending', updated = NOW()
       WHERE ID = ?`,
      [id],
    );

    return result.affectedRows > 0;
  },

  /**
   * Accept an adjustment and update the corresponding agreement
   */
  acceptAdjustment: async function (token: string): Promise<boolean> {
    try {
      // Update adjustment status
      const [res] = await DAO.query(
        `UPDATE Agreement_inflation_adjustments 
         SET status = 'accepted', updated = NOW() 
         WHERE token = ?`,
        [token],
      );

      return res.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get all pending adjustments
   */
  getAllExisting: async function (): Promise<Agreement_inflation_adjustments[]> {
    const [adjustments] = await DAO.query<Agreement_inflation_adjustments[]>(
      `SELECT * FROM Agreement_inflation_adjustments`,
    );

    return adjustments.map(mapDbAgreementToJs);
  },

  /**
   * Get all new adjustments (added but not yet sent)
   */
  getAllNew: async function (): Promise<Agreement_inflation_adjustments[]> {
    const [adjustments] = await DAO.query<Agreement_inflation_adjustments[]>(
      `SELECT * FROM Agreement_inflation_adjustments 
       WHERE status = 'new'`,
    );

    return adjustments.map(mapDbAgreementToJs);
  },
};

const mapDbAgreementToJs = (
  agreement: SqlResult<Agreement_inflation_adjustments>,
): Agreement_inflation_adjustments => {
  return {
    ID: agreement.ID,
    agreement_ID: agreement.agreement_ID,
    agreement_type: agreement.agreement_type as "avtaleGiro" | "autoGiro" | "vipps",
    current_amount: agreement.current_amount / 100,
    proposed_amount: agreement.proposed_amount / 100,
    inflation_percentage: agreement.inflation_percentage as unknown as Prisma.Decimal,
    token: agreement.token,
    status: agreement.status as "pending" | "accepted" | "rejected" | "expired",
    created: agreement.created,
    updated: agreement.updated,
    expires: agreement.expires,
  };
};
