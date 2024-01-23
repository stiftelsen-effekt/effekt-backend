import {
  AutoGiro_agreement_charges,
  AutoGiro_agreements,
  AutoGiro_mandates,
  AutoGiro_shipments,
} from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import { DateTime } from "luxon";
import sqlString from "sqlstring";

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
  getAgreements: async function (
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
      if (filter.statuses.length > 0)
        where.push(
          ` AG.active IN (${filter.statuses.map((ID) => sqlString.escape(ID)).join(",")}) `,
        );
    }

    const [agreements] = await DAO.query(
      `
          SELECT DISTINCT
              AG.ID,
              AG.active,
              ROUND(AG.amount / 100, 0) as amount,
              AG.KID,
              AG.payment_date,
              AG.created,
              AG.cancelled,
              AG.last_updated,
              AG.notice,
              Donors.full_name 
          FROM AutoGiro_agreements as AG
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
          SELECT COUNT(*) as count FROM AutoGiro_agreements
      `);

    return {
      pages: Math.ceil(counter[0].count / limit),
      rows: agreements,
    };
  },
  getAgreementSumHistogram: async function () {
    let [results] = await DAO.query(`
              SELECT 
                  floor(amount/500)*500/100 	AS bucket, 
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
  addAgreement: async function (agreement: AutoGiro_agreements): Promise<number> {
    const [result] = await DAO.query(
      `
        INSERT INTO AutoGiro_agreements (KID, amount, payment_date, notice, active)
        VALUES (?, ?, ?, ?, ?)
      `,
      [agreement.KID, agreement.amount, agreement.payment_date, agreement.notice, agreement.active],
    );
    return result.insertId;
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
    return mapMandateType(mandate?.[0]);
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
};

const mapAgreementType = (agreement: SqlResult<AutoGiro_agreements>): AutoGiro_agreements => {
  return {
    ...agreement,
    notice: agreement.notice == 1,
    active: agreement.active == 1,
    last_updated: DateTime.fromISO(agreement.last_updated).toJSDate(),
    created: DateTime.fromISO(agreement.created).toJSDate(),
    cancelled: agreement.cancelled ? DateTime.fromISO(agreement.cancelled).toJSDate() : null,
  };
};

const mapMandateType = (mandate: SqlResult<AutoGiro_mandates>): AutoGiro_mandates => {
  return {
    ...mandate,
    last_updated: DateTime.fromISO(mandate.last_updated).toJSDate(),
    created: DateTime.fromISO(mandate.created).toJSDate(),
  };
};
