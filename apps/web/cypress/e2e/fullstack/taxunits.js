/**
 * Full-stack Min Side tax units (Skatt): the tax units and their yearly sums come from the real API
 * (tRPC minside.taxUnits) and database, for the e2e donor written by apps/api/prisma/e2e/seed.mjs. The bank
 * transfers (500 kr in 2022, 1 000 kr in 2023, 2 500 kr in 2025) belong to the second tax unit,
 * the Vipps and AvtaleGiro donations (700 kr in 2024, 500 kr in 2025) to the first.
 */
import { DONOR_ID, TAX_UNITS } from "../../../../../apps/api/prisma/e2e/data.mjs";
import { trpcData, trpcUrl } from "../../support/trpc";

/** The visible (desktop) list of one tax unit */
const taxUnitList = (unit) =>
  cy
    .get("[data-cy=generic-list]:visible")
    .filter(`:has([data-cy=generic-list-header-title]:contains("${unit.name}"))`);

const row = (unit, label) => taxUnitList(unit).contains("tbody", label);

describe("Tax units (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
    cy.loginFullstack(DONOR_ID);

    cy.intercept("GET", trpcUrl("minside.taxUnits")).as("taxUnits");
    cy.visit("/min-side/skatt/");
    cy.wait("@taxUnits", { timeout: 30000 });
  });

  it("gets the donor's tax units from the API", () => {
    cy.get("@taxUnits").then((interception) => {
      const units = trpcData(interception, "minside.taxUnits");
      expect(units).to.have.length(2);

      const main = units.find((u) => u.id === TAX_UNITS.main.id);
      expect(main).to.deep.include({
        donorId: DONOR_ID,
        name: TAX_UNITS.main.name,
        ssn: TAX_UNITS.main.ssn,
        registered: "2022-01-10T10:00:00.000Z",
        archived: null,
        sumDonations: "1200",
        numDonations: 4,
      });
      const spouse = units.find((u) => u.id === TAX_UNITS.spouse.id);
      expect(spouse).to.deep.include({ sumDonations: "4000", numDonations: 3 });

      const yearly = (unit) =>
        unit.taxDeductions.filter((d) => d.sumDonations > 0).map((d) => [d.year, d.sumDonations]);
      expect(yearly(main)).to.deep.equal([
        [2024, 700],
        [2025, 500],
      ]);
      expect(yearly(spouse)).to.deep.equal([
        [2022, 500],
        [2023, 1000],
        [2025, 2500],
      ]);
    });
  });

  it("lists each tax unit with its yearly and total donations", () => {
    taxUnitList(TAX_UNITS.main).should("contain.text", "158685 10045");
    row(TAX_UNITS.main, "2024").should("contain.text", "700 kr");
    row(TAX_UNITS.main, "2025").should("contain.text", "500 kr");
    row(TAX_UNITS.main, "Totalt").should("contain.text", "1 200 kr");

    taxUnitList(TAX_UNITS.spouse).should("contain.text", "158685 10126");
    row(TAX_UNITS.spouse, "2022").should("contain.text", "500 kr");
    row(TAX_UNITS.spouse, "2023").should("contain.text", "1 000 kr");
    row(TAX_UNITS.spouse, "2025").should("contain.text", "2 500 kr");
    row(TAX_UNITS.spouse, "Totalt").should("contain.text", "4 000 kr");
  });
});
