/**
 * Full-stack Min Side donations page: the donations, the yearly aggregates and the distributions
 * come from the real API (tRPC minside.donations, minside.donationsAggregated and
 * minside.distributions) and database, for the e2e donor written by apps/api/prisma/e2e/seed.mjs.
 */
import {
  DONOR_ID,
  KIDS,
  TAX_UNITS,
  AGF,
  HKI,
  NI,
  AMF,
} from "../../../../../apps/api/prisma/e2e/data.mjs";
import { trpcData, trpcUrl } from "../../support/trpc";

// The seeded donations (apps/api/prisma/e2e/seed.mjs): 7 donations, 5 200 kr in total, 2022–2025
const TOTAL = 5200;
const YEARS = [2022, 2023, 2024, 2025];

describe("Donations page (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
    cy.loginFullstack(DONOR_ID);

    cy.intercept("GET", trpcUrl("minside.donations")).as("donations");
    cy.intercept("GET", trpcUrl("minside.donationsAggregated")).as("aggregated");
    cy.intercept("GET", trpcUrl("minside.distributions")).as("distributions");

    cy.visit("/min-side/");
    cy.wait(["@donations", "@aggregated", "@distributions"], { timeout: 30000 });
  });

  it("gets the donor's donations, aggregates and distributions from the API", () => {
    cy.get("@donations").then((interception) => {
      const donations = trpcData(interception, "minside.donations");
      expect(donations).to.have.length(7);
      expect(donations.find((d) => d.id === 900006)).to.deep.include({
        KID: KIDS.bank,
        donorId: DONOR_ID,
        sum: "2500.00",
        timestamp: "2025-09-01T12:00:00.000Z",
        taxUnitId: TAX_UNITS.spouse.id,
      });
    });

    cy.get("@aggregated").then((interception) => {
      const rows = trpcData(interception, "minside.donationsAggregated");
      const total = rows.reduce((sum, row) => sum + parseFloat(row.value), 0);
      expect(Math.round(total)).to.equal(TOTAL);
      expect([...new Set(rows.map((row) => row.year))].sort()).to.deep.equal(YEARS);
    });

    cy.get("@distributions").then((interception) => {
      const distributions = trpcData(interception, "minside.distributions");
      // Requested for the KIDs of the donations only: bank, Vipps (custom) and AvtaleGiro
      expect(distributions.map((d) => d.kid).sort()).to.deep.equal(
        [KIDS.bank, KIDS.vippsCustom, KIDS.avtalegiro].sort(),
      );
      const custom = distributions.find((d) => d.kid === KIDS.vippsCustom);
      expect(custom.taxUnitId).to.equal(TAX_UNITS.main.id);
      expect(custom.causeAreas).to.have.length(1);
      expect(
        custom.causeAreas[0].organizations.map((o) => [o.id, parseFloat(o.percentageShare)]),
      ).to.have.deep.members([
        [AGF, 30],
        [HKI, 15],
        [NI, 25],
        [AMF, 30],
      ]);
    });
  });

  it("shows the total and a list per year", () => {
    cy.get("[data-cy=aggregated-donation-totals]").should("contain.text", "5 200 kr");
    for (const year of YEARS) {
      cy.get("[data-cy=year-menu]").should("contain.text", year);
      cy.get("[data-cy=generic-list-header]").should("contain.text", year);
    }
  });

  it("lists a donation with its sum and KID", () => {
    cy.get("[data-cy=generic-list-table]")
      .contains("tbody", KIDS.bank)
      .should("contain.text", "2 500 kr");
  });

  it("shows the stored distribution when a donation is expanded", () => {
    cy.get("[data-cy=generic-list-table]")
      .contains("tbody", KIDS.vippsCustom)
      .as("donation")
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    cy.get("@donation").find("[data-cy=donation-impact-list]").should("exist");
    cy.get("@donation").should("not.contain.text", "Ingen distribusjon funnet");
  });

  it("shows only that year's donations when a year is picked", () => {
    cy.get("[data-cy=year-menu]").find("ul").contains("li", "2024").click();
    cy.get("[data-cy=generic-list-header]").should("have.length", 1).and("contain.text", "2024");
    // 2024 has the Vipps and AvtaleGiro donations; the bank transfers are from other years
    cy.get("[data-cy=generic-list-table]")
      .should("contain.text", KIDS.vippsCustom)
      .and("contain.text", KIDS.avtalegiro)
      .and("not.contain.text", KIDS.bank);
  });
});
