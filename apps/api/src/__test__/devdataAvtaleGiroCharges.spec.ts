import { describe, it, beforeAll } from "vitest";
import { expect } from "chai";
import { isoDate, toDay } from "../../prisma/devdata/calendar";
import { config } from "../../prisma/devdata/config";
import { generate, type Dataset, type Row } from "../../prisma/devdata/generate";
import { AvtaleGiroChargeStatus } from "../custom_modules/avtalegiro/charges";

/** AvtaleGiro charges in the local dev data (prisma/devdata/generate.ts › avtaleGiroChargeRun) */
describe("dev data: AvtaleGiro charges", { timeout: 30000 }, function () {
  const start = toDay("2021-10-01");
  const end = toDay("2026-10-27");
  let data: Dataset;
  let charges: Row[];

  beforeAll(() => {
    data = generate({ seed: "effekt-dev", start, end, anchor: end, scale: 1 });
    charges = data.Avtalegiro_agreement_charges;
  });

  const withStatus = (status: string) => charges.filter((c) => c.status === status);
  const today = isoDate(end);

  it("has claims in the statuses the jobs produce, only for recent months", () => {
    const statuses = new Set(charges.map((c) => c.status));
    for (const status of statuses) {
      expect(Object.values(AvtaleGiroChargeStatus)).to.include(status);
    }
    expect(withStatus("COMPLETED").length).to.be.greaterThan(1000);
    expect(withStatus("SUPERSEDED").length).to.be.greaterThan(0);
    expect(withStatus("DELETED").length).to.be.greaterThan(0);
    // Upcoming claims, already sent, and a few past ones that were never paid
    expect(withStatus("CLAIMED").some((c) => String(c.due_date) > today)).to.be.true;
    expect(withStatus("CLAIMED").some((c) => String(c.due_date) < today)).to.be.true;

    const first = charges.map((c) => String(c.created)).sort()[0];
    const initialEnd = start + Math.round(config.years * 365.25);
    expect(first >= isoDate(initialEnd - config.avtaleGiro.chargeHistoryDays)).to.be.true;
  });

  it("links each completed claim to the AvtaleGiro payment for its KID", () => {
    const donations = new Map(data.Donations.map((d) => [d.ID, d]));
    for (const charge of withStatus("COMPLETED")) {
      const donation = donations.get(charge.donationID as number)!;
      expect(donation, `donation ${charge.donationID}`).to.exist;
      expect(donation.KID_fordeling).to.equal(charge.KID);
      expect(Number(donation.sum_confirmed) * 100).to.equal(charge.amount);
      expect(String(donation.timestamp_confirmed).slice(0, 10) >= String(charge.due_date)).to.be
        .true;
    }
    const linked = charges.filter((c) => c.donationID !== null).map((c) => c.donationID);
    expect(new Set(linked).size).to.equal(linked.length);
  });

  it("has one live claim per agreement and due date; a superseded one has its retry", () => {
    const live = new Map<string, Row>();
    for (const charge of charges.filter((c) => c.status !== "SUPERSEDED")) {
      const key = `${charge.agreementID}:${charge.due_date}`;
      expect(live.has(key), key).to.be.false;
      live.set(key, charge);
    }
    for (const superseded of withStatus("SUPERSEDED")) {
      const retry = live.get(`${superseded.agreementID}:${superseded.due_date}`)!;
      expect(retry).to.exist;
      expect(retry.shipmentID as number).to.be.greaterThan(superseded.shipmentID as number);
    }
  });

  it("deletes claims of agreements cancelled before the due date", () => {
    const agreements = new Map(data.Avtalegiro_agreements.map((a) => [a.ID, a]));
    for (const charge of charges.filter((c) => String(c.status).startsWith("DELETE"))) {
      const agreement = agreements.get(charge.agreementID)!;
      expect(agreement.cancelled).to.be.a("string");
      expect(String(agreement.cancelled) < String(charge.due_date)).to.be.true;
      expect(charge.deletion_shipmentID).to.be.a("number");
      expect(charge.donationID).to.be.null;
    }
  });
});
