import {
  AutoGiro_agreement_charges,
  AutoGiro_agreements,
  AutoGiro_mandates,
  AutoGiro_shipment,
} from "@prisma/client";
import { DAO, SqlResult } from "../DAO";
import { DateTime } from "luxon";

export const autogiroagreements = {
  getShipmentById: async function (ID: number) {
    const [shipment] = await DAO.query<AutoGiro_shipment[]>(
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
  getMandateById: async function (ID: number) {
    const [mandate] = await DAO.query<AutoGiro_mandates[]>(
      `
        SELECT * FROM AutoGiro_mandates WHERE ID = ?
      `,
      [ID],
    );
    return mandate?.[0];
  },
  getMandateByKID: async function (KID: string) {
    const [mandate] = await DAO.query<AutoGiro_mandates[]>(
      `
        SELECT * FROM AutoGiro_mandates WHERE KID = ?
      `,
      [KID],
    );
    return mandate?.[0];
  },
  getMandateByStatus: async function (status: string) {
    const [mandate] = await DAO.query<AutoGiro_mandates[]>(
      `
        SELECT * FROM AutoGiro_mandates WHERE status = ?
      `,
      [status],
    );
    return mandate?.[0];
  },
  addMandate: async function (mandate: AutoGiro_mandates): Promise<number> {
    const [result] = await DAO.query(
      `
        INSERT INTO AutoGiro_mandates (KID, status, bank_account, special_information, name_and_address, postal_code, postal_label)
        VALUES (?, ?, ?, ?, ?)
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
