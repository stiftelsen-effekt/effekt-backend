import {
  AutoGiro_agreement_charges,
  AutoGiro_agreements,
  AutoGiro_mandates,
  AutoGiro_shipments,
} from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import { DateTime } from "luxon";
import sqlString from "sqlstring";
import { Distribution, DistributionInput } from "../../schemas/types";

export const autogiroagreements = {
  getAllShipments: async function () {
    const [shipments] = await DAO.query<AutoGiro_shipments[]>(
      `
        SELECT * FROM AutoGiro_shipments
      `,
    );
    return shipments;
  },
  getShipmentById: async function (ID: number) {
    const [shipment] = await DAO.query<AutoGiro_shipments[]>(
      `
        SELECT * FROM AutoGiro_shipments WHERE ID = ?
      `,
      [ID],
    );
    return shipment?.[0];
  },
  addShipment: async function (numberOfCharges: number): Promise<number> {
    const [result] = await DAO.query(
      `
        INSERT INTO AutoGiro_shipments (num_charges)
        VALUES (?)
      `,
      [numberOfCharges],
    );
    return result.insertId;
  },
  updateShipmentSentTime: async function (ID: number, sent: DateTime) {
    await DAO.query(
      `
        UPDATE AutoGiro_shipments SET sent_date = ? WHERE ID = ?
      `,
      [sent.toISO(), ID],
    );
  },
  removeShipment: async function (ID: number) {
    await DAO.query(
      `
        DELETE FROM AutoGiro_shipments WHERE ID = ?
      `,
      [ID],
    );
  },
  getAgreements: async function (
    sort: { desc: boolean; id: string },
    page: number,
    limit: number,
    filter: any,
  ): Promise<{
    pages: number;
    rows: AutoGiro_agreements[];
    statistics: {
      numAgreements: number;
      sumAgreements: string;
      avgAgreement: string;
    };
  }> {
    const sortColumn = sort.id;
    const sortDirection = sort.desc ? "DESC" : "ASC";
    const offset = page * limit;

    let where = [];
    if (filter) {
      if (filter.amount) {
        if (filter.amount.from)
          where.push(`amount >= ${sqlString.escape(filter.amount.from * 100)} `);
        if (filter.amount.to) where.push(`amount <= ${sqlString.escape(filter.amount.to * 100)} `);
      }
      if (filter.paymentDate) {
        if (filter.paymentDate.from !== undefined)
          where.push(`AG.payment_date >= ${sqlString.escape(filter.paymentDate.from)} `);
        if (filter.paymentDate.to !== undefined)
          where.push(`AG.payment_date <= ${sqlString.escape(filter.paymentDate.to)} `);
      }
      if (filter.created) {
        if (filter.created.from)
          where.push(`AG.created >= ${sqlString.escape(filter.created.from)} `);
        if (filter.created.to) where.push(`AG.created <= ${sqlString.escape(filter.created.to)} `);
      }

      if (filter.KID)
        where.push(` CAST(DI.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `);
      if (filter.donor)
        where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `);
      if (filter.statuses) {
        if (filter.statuses.length === 0) {
          return {
            pages: 0,
            rows: [],
            statistics: {
              numAgreements: 0,
              sumAgreements: "0",
              avgAgreement: "0",
            },
          };
        }
        where.push(
          ` AG.active IN (${filter.statuses.map((ID) => sqlString.escape(ID)).join(",")}) `,
        );
      }
    }

    const columns = `
      AG.ID,
      AG.active,
      AG.amount,
      AG.KID,
      AG.payment_date,
      AG.created,
      AG.cancelled,
      AG.last_updated,
      AG.notice,
      Donors.full_name 
    `;

    const [agreements] = await DAO.query(
      `
          SELECT
              count(*) OVER() AS full_count,
              sum(amount) OVER() AS full_sum,
              avg(amount) OVER() AS full_avg,
              ${columns}
          FROM AutoGiro_agreements as AG
          INNER JOIN Distributions as DI
              ON AG.KID = DI.KID
          INNER JOIN Donors 
              ON DI.Donor_ID = Donors.ID
          WHERE
              ${where.length !== 0 ? where.join(" AND ") : "1"}

          GROUP BY
              ${columns}

          ORDER BY ${sortColumn} ${sortDirection}
          LIMIT ? OFFSET ?
          `,
      [limit, offset],
    );

    const numAgreements = agreements.length > 0 ? agreements[0]["full_count"] : 0;
    const sumAgreements = agreements.length > 0 ? agreements[0]["full_sum"] : 0;
    const avgAgreement = agreements.length > 0 ? agreements[0]["full_avg"] : 0;

    return {
      pages: Math.ceil(numAgreements / limit),
      rows: agreements,
      statistics: {
        numAgreements,
        sumAgreements,
        avgAgreement,
      },
    };
  },
  getAgreementSumHistogram: async function () {
    let [results] = await DAO.query(`
              SELECT 
                  floor(amount/500)*500 	AS bucket, 
                  count(*) 						AS items,
                  ROUND(100*LN(COUNT(*)))         AS bar
              FROM AutoGiro_agreements
              GROUP BY 1
              ORDER BY 1;
          `);

    return results;
  },
  getAgreementById: async function (ID: number) {
    const [agreement] = await DAO.query<AutoGiro_agreements[]>(
      `
        SELECT * FROM AutoGiro_agreements WHERE ID = ?
      `,
      [ID],
    );
    return agreement.map(mapAgreementType)?.[0];
  },
  getAgreementByKID: async function (KID: string) {
    const [agreement] = await DAO.query<AutoGiro_agreements[]>(
      `
        SELECT * FROM AutoGiro_agreements WHERE KID = ?
      `,
      [KID],
    );
    return agreement.map(mapAgreementType)?.[0];
  },
  /**
   * Get all agreements that have a given payment date
   * @param date Day on the month to get agreements for, 0 indicates last day of month
   */
  getAgreementsByPaymentDate: async function (date: number) {
    const [agreements] = await DAO.query<AutoGiro_agreements[]>(
      `
        SELECT * FROM AutoGiro_agreements WHERE payment_date = ?
      `,
      [date],
    );
    return agreements.map(mapAgreementType);
  },
  getAgreementsByDonorId: async function (donorId: number) {
    const [agreements] = await DAO.query<AutoGiro_agreements[]>(
      `
        SELECT * FROM AutoGiro_agreements as AG
          INNER JOIN Distributions as D ON
            AG.KID = D.KID 
          WHERE Donor_ID = ?
      `,
      [donorId],
    );
    return agreements.map(mapAgreementType);
  },
  addAgreement: async function (
    agreement: Pick<
      AutoGiro_agreements,
      "mandateID" | "KID" | "amount" | "notice" | "active" | "payment_date"
    >,
  ): Promise<number> {
    const [result] = await DAO.query(
      `
        INSERT INTO AutoGiro_agreements (mandateID, KID, amount, payment_date, notice, active)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        agreement.mandateID,
        agreement.KID,
        agreement.amount,
        agreement.payment_date,
        agreement.notice,
        agreement.active,
      ],
    );
    return result.insertId;
  },
  draftAgreement: async function (
    agreement: Pick<AutoGiro_agreements, "KID" | "amount" | "payment_date">,
  ): Promise<number> {
    const [mandateResult] = await DAO.query(
      `
        INSERT INTO AutoGiro_mandates (status, KID)
        VALUES (?, ?)
    `,
      ["DRAFTED", agreement.KID],
    );

    const mandateID = mandateResult.insertId;

    const [agreementResult] = await DAO.query(
      `
        INSERT INTO AutoGiro_agreements (mandateID, KID, amount, payment_date, notice, active)
        VALUES (?,?, ?, ?, ?, ?)
      `,
      [mandateID, agreement.KID, agreement.amount, agreement.payment_date, 1, 0],
    );
    return agreementResult.insertId;
  },
  replaceAgreementDistribution: async (
    originalDistribution: Distribution,
    newKid: string,
    newDistributionInput: DistributionInput,
    metaOwnerID?: number,
  ) => {
    if (!metaOwnerID) {
      metaOwnerID = await DAO.meta.getDefaultOwnerID();
    }

    const transaction = await DAO.startTransaction();
    try {
      // Replaces original KID with a new KID to preserve donation history
      await transaction.query(`UPDATE Distributions SET KID = ? WHERE KID = ?`, [
        newKid,
        originalDistribution.kid,
      ]);

      // Updates donations with the old distributions to use the replacement KID (preserves donation history)
      await transaction.query(`UPDATE Donations SET KID_fordeling = ? WHERE KID_fordeling = ?`, [
        newKid,
        originalDistribution.kid,
      ]);

      // Add new distribution using the original KID
      await DAO.distributions.add(
        {
          ...newDistributionInput,
          kid: originalDistribution.kid,
        },
        metaOwnerID,
        transaction,
      );

      // Links the replacement KID to the original AutoGiro KID
      await transaction.query(
        `
                INSERT INTO AutoGiro_replaced_distributions(Replacement_KID, Original_AutoGiro_KID)
                VALUES (?, ?)
            `,
        [newKid, originalDistribution.kid],
      );

      // Reset the AutoGiro agreement to use the new distribution KID
      // We need to do this because of a foreign key constraint that updates the agreement
      // KID when we edit the distribution
      await transaction.query(`UPDATE AutoGiro_agreements SET KID = ? WHERE KID = ?`, [
        originalDistribution.kid,
        newKid,
      ]);

      await DAO.commitTransaction(transaction);
    } catch (ex) {
      await DAO.rollbackTransaction(transaction);
      throw ex;
    }

    return true;
  },
  setAgreementAmountByKID: async function (KID: string, amount: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreements SET amount = ? WHERE KID = ?
      `,
      [amount, KID],
    );
  },
  setAgreementPaymentDateByKID: async function (KID: string, paymentDate: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreements SET payment_date = ? WHERE KID = ?
      `,
      [paymentDate, KID],
    );
  },
  activateAgreementByKID: async function (KID: string) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreements SET active = 1, cancelled = NULL WHERE KID = ?
      `,
      [KID],
    );
  },
  cancelAgreementByKID: async function (KID: string) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreements SET active = 0, cancelled = NOW() WHERE KID = ?
      `,
      [KID],
    );
  },
  getAgreementChargeById: async function (ID: number) {
    const [charge] = await DAO.query<AutoGiro_agreement_charges[]>(
      `
        SELECT * FROM AutoGiro_agreement_charges WHERE ID = ?
      `,
      [ID],
    );
    return charge?.[0];
  },
  getAgreementChargesByAgreementId: async function (agreementId: number) {
    const [charges] = await DAO.query<AutoGiro_agreement_charges[]>(
      `
        SELECT * FROM AutoGiro_agreement_charges WHERE agreementID = ?
      `,
      [agreementId],
    );
    return charges;
  },
  getAgreementChargesByShipmentId: async function (shipmentId: number) {
    const [charges] = await DAO.query<AutoGiro_agreement_charges[]>(
      `
        SELECT * FROM AutoGiro_agreement_charges WHERE shipmentID = ?
      `,
      [shipmentId],
    );
    return charges;
  },
  getAgreementChargeByDonationId: async function (donationId: number) {
    const [charge] = await DAO.query<AutoGiro_agreement_charges[]>(
      `
        SELECT * FROM AutoGiro_agreement_charges WHERE donationID = ?
      `,
      [donationId],
    );
    return charge?.[0];
  },
  /**
   * Check if an agreement charge exists for a given KID and claim date (month and year, since we only charge once a month)
   * @param KID
   * @param claimDate
   * @returns
   */
  getAgreementChargeByAgreementIdAndClaimDate: async function (
    agreementId: number,
    claimDate: DateTime,
  ) {
    const [charge] = await DAO.query<AutoGiro_agreement_charges[]>(
      `
        SELECT * FROM AutoGiro_agreement_charges WHERE agreementID = ? AND YEAR(claim_date) = ? AND MONTH(claim_date) = ?
      `,
      [agreementId, claimDate.year, claimDate.month],
    );
    return charge?.[0];
  },
  /**
   * Check if an agreement charge exists for a given KID and claim date (month and year, since we only charge once a month)
   * @returns Agreements that have not been charged for the current month
   */
  getAgreementsToCharge: async function () {
    const [agreements] = await DAO.query<AutoGiro_agreements[]>(`
      SELECT 
      AG.ID,
        AG.mandateID,
        AG.KID,
        AG.amount,
        AG.payment_date,
        AG.notice,
        AG.active,
        AG.last_updated,
        AG.created,
        AG.cancelled

        FROM AutoGiro_agreements as AG

        LEFT JOIN (SELECT * FROM AutoGiro_agreement_charges WHERE MONTH(AutoGiro_agreement_charges.claim_date) = MONTH(current_time())) as CH
          ON CH.agreementID = AG.ID
      
      WHERE \`active\` = 1 
      AND (LENGTH(AG.KID) = 15 OR LENGTH(AG.KID) = 8 OR AG.KID = 23121496795)
      AND CH.ID IS NULL
      ORDER BY AG.payment_date ASC`);

    return agreements;
  },
  addAgreementCharge: async function (
    charge: Omit<AutoGiro_agreement_charges, "ID" | "created" | "last_updated">,
  ): Promise<number> {
    const [result] = await DAO.query(
      `
        INSERT INTO AutoGiro_agreement_charges (agreementID, shipmentID, donationID, amount, claim_date, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        charge.agreementID,
        charge.shipmentID,
        charge.donationID,
        charge.amount,
        charge.claim_date,
        charge.status,
      ],
    );
    return result.insertId;
  },
  cancelAgreementCharge: async function (ID: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreement_charges SET status = "CANCELLED" WHERE ID = ?
      `,
      [ID],
    );
  },
  setAgreementChargeFailed: async function (ID: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreement_charges SET status = "FAILED" WHERE ID = ?
      `,
      [ID],
    );
  },
  setAgreementChargeCompleted: async function (ID: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreement_charges SET status = "COMPLETED" WHERE ID = ?
      `,
      [ID],
    );
  },
  setAgreementChargeAmended: async function (ID: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_agreement_charges SET status = "AMENDED" WHERE ID = ?
      `,
      [ID],
    );
  },
  getMandates: async function (
    sort: { desc: boolean; id: string },
    page: number,
    limit: number,
    filter: any,
  ) {
    const sortColumn = sort.id;
    const sortDirection = sort.desc ? "DESC" : "ASC";
    const offset = page * limit;

    let where = [];
    if (filter) {
      if (filter.KID)
        where.push(` CAST(DI.KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `);
      if (filter.donor)
        where.push(` (Donors.full_name LIKE ${sqlString.escape(`%${filter.donor}%`)}) `);
      if (filter.statuses && filter.statuses.length > 0)
        where.push(
          ` AG.status IN (${filter.statuses.map((status) => sqlString.escape(status)).join(",")}) `,
        );
    }

    const [mandates] = await DAO.query(
      `
          SELECT DISTINCT
              AG.ID,
              AG.KID,
              AG.status,
              AG.bank_account,
              AG.special_information,
              AG.name_and_address,
              AG.postal_code,
              AG.postal_label,
              AG.last_updated,
              AG.created,
              Donors.full_name
          FROM AutoGiro_mandates as AG
          INNER JOIN Distributions as DI
              ON AG.KID = DI.KID
          INNER JOIN Donors 
              ON DI.Donor_ID = Donors.ID
          WHERE
              ${where.length !== 0 ? where.join(" AND ") : "1"}

          ORDER BY ${sortColumn} ${sortDirection}
          LIMIT ? OFFSET ?
          `,
      [limit, offset],
    );

    const [counter] = await DAO.query(`
          SELECT COUNT(*) as count FROM AutoGiro_mandates
      `);

    return {
      pages: Math.ceil(counter[0].count / limit),
      rows: mandates,
    };
  },
  getMandateById: async function (ID: number) {
    const [mandate] = await DAO.query<AutoGiro_mandates[]>(
      `
        SELECT * FROM AutoGiro_mandates WHERE ID = ?
      `,
      [ID],
    );
    return mapMandateType(mandate?.[0]);
  },
  getMandateByKID: async function (KID: string) {
    const [mandate] = await DAO.query<AutoGiro_mandates[]>(
      `
        SELECT * FROM AutoGiro_mandates WHERE KID = ?
      `,
      [KID],
    );
    if (mandate.length === 0) return null;
    return mapMandateType(mandate[0]);
  },
  getMandatesByStatus: async function (status: string) {
    const [mandates] = await DAO.query<AutoGiro_mandates[]>(
      `
        SELECT * FROM AutoGiro_mandates WHERE status = ?
      `,
      [status],
    );
    return mandates.map(mapMandateType);
  },
  addMandate: async function (
    mandate: Omit<AutoGiro_mandates, "ID" | "last_updated" | "created">,
  ): Promise<number> {
    const [result] = await DAO.query(
      `
        INSERT INTO AutoGiro_mandates (KID, status, bank_account, special_information, name_and_address, postal_code, postal_label)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        mandate.KID,
        mandate.status,
        mandate.bank_account,
        mandate.special_information,
        mandate.name_and_address,
        mandate.postal_code,
        mandate.postal_label,
      ],
    );
    return result.insertId;
  },
  updateMandate: async function (mandate: Omit<AutoGiro_mandates, "last_updated" | "created">) {
    await DAO.query(
      `
        UPDATE AutoGiro_mandates SET KID = ?, status = ?, bank_account = ?, special_information = ?, name_and_address = ?, postal_code = ?, postal_label = ? WHERE ID = ?
      `,
      [
        mandate.KID,
        mandate.status,
        mandate.bank_account,
        mandate.special_information,
        mandate.name_and_address,
        mandate.postal_code,
        mandate.postal_label,
        mandate.ID,
      ],
    );
  },
  activateMandate: async function (ID: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_mandates SET status = "ACTIVE" WHERE ID = ?
      `,
      [ID],
    );
  },
  cancelMandate: async function (ID: number) {
    await DAO.query(
      `
        UPDATE AutoGiro_mandates SET status = "CANCELLED" WHERE ID = ?
      `,
      [ID],
    );
  },
  setMandateStatus: async function (
    ID: number,
    status: "NEW" | "ACTIVE" | "CANCELLED" | "PENDING" | "REJECTED",
  ) {
    await DAO.query(
      `
        UPDATE AutoGiro_mandates SET status = ? WHERE ID = ?
      `,
      [status, ID],
    );
  },
  /**
   * Looks for agreements with pending charges that differ from the agreement amount and date
   */
  getAmendmentCandidates: async function () {
    const [result] = await DAO.query<AutogiroChargeToBeAmended[]>(`
      SELECT 
        CH.ID as chargeId,
        AG.ID as agreementId,
        CH.status,
        AG.KID,
        CH.amount != AG.amount as changedAmount,
        (
          DAY(CH.claim_date) != AG.payment_date
          AND
          NOT(DATE(CH.claim_date) = LAST_DAY(CH.claim_date) AND AG.payment_date = 0)
          ) as changedDate,
          AG.cancelled IS NOT NULL as agreementCancelled,
          AG.amount as agreementAmount,
          CH.amount as chargeAmount,
          AG.payment_date as agreementDay,
          CH.claim_date as claimDate
        
        FROM AutoGiro_agreement_charges as CH
          INNER JOIN AutoGiro_agreements as AG 
            ON CH.agreementID = AG.ID 
                
          WHERE 
            (
              CH.amount != AG.amount
              OR
              (
                DAY(CH.claim_date) != AG.payment_date
                AND
                NOT(DATE(CH.claim_date) = LAST_DAY(CH.claim_date) AND AG.payment_date = 0)
              )
            )
            AND CH.status = "PENDING"
      `);

    return result.map(mapChargeToBeAmended);
  },
};

export type AutogiroChargeToBeAmended = {
  chargeId: number;
  agreementId: number;
  status: string;
  KID: string;
  changedAmount: boolean;
  changedDate: boolean;
  agreementCancelled: boolean;
  agreementAmount: number;
  chargeAmount: number;
  agreementDay: number;
  claimDate: Date;
};

const mapChargeToBeAmended = (
  charge: SqlResult<AutogiroChargeToBeAmended>,
): AutogiroChargeToBeAmended => {
  return {
    ...charge,
    changedAmount: charge.changedAmount == 1,
    changedDate: charge.changedDate == 1,
    agreementCancelled: charge.agreementCancelled == 1,
  };
};

const mapAgreementType = (agreement: SqlResult<AutoGiro_agreements>): AutoGiro_agreements => {
  return {
    ...agreement,
    notice: agreement.notice == 1,
    active: agreement.active == 1,
  };
};

const mapMandateType = (mandate: SqlResult<AutoGiro_mandates>): AutoGiro_mandates => {
  return {
    ...mandate,
  };
};
