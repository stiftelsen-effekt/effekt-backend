/**
 * Full-stack Min Side yearly tax reports (Skatt → Årsoppgaver): the reports come from the real API
 * (tRPC minside.taxReports), which computes them with the Norwegian deduction rules from the e2e
 * donor written by apps/api/prisma/e2e/seed.mjs. Per tax unit and year: the first unit has the
 * Vipps and AvtaleGiro donations (700 kr in 2024, 500 kr in 2025), the second the bank transfers
 * (500 kr in 2022, 1 000 kr in 2023, 2 500 kr in 2025). Every donation has a tax unit.
 */
import { DONOR_ID, TAX_UNITS } from "../../../../../apps/api/prisma/e2e/data.mjs";
import { trpcData, trpcUrl } from "../../support/trpc";

/** The visible (desktop) report of one year */
const yearReport = (year) =>
  cy
    .get("[data-cy=generic-list]:visible")
    .filter(`:has([data-cy=generic-list-header-title]:contains("${year}"))`)
    .first();

describe("Yearly tax reports (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
    cy.loginFullstack(DONOR_ID);

    cy.intercept("GET", trpcUrl("minside.taxReports")).as("taxReports");
    cy.visit("/min-side/skatt/aarsoppgaver");
    cy.wait("@taxReports", { timeout: 30000 });
  });

  it("gets the donor's yearly reports from the API", () => {
    cy.get("@taxReports").then((interception) => {
      const reports = trpcData(interception, "minside.taxReports");

      // The previous year down to 2022
      const lastYear = new Date().getFullYear() - 1;
      expect(reports.map((r) => r.year)).to.deep.equal(
        Array.from({ length: lastYear - 2021 }, (_, i) => lastYear - i),
      );

      /** [tax unit id, sum, deduction] per unit of the year */
      const units = (year) =>
        reports
          .find((r) => r.year === year)
          .units.map((u) => [u.id, u.sumDonations, u.taxDeduction]);
      const { main, spouse } = TAX_UNITS;
      // Deductible from 500 kr a year (Norwegian rules), up to 25 000 kr
      expect(units(2025)).to.deep.equal([
        [main.id, 500, 500],
        [spouse.id, 2500, 2500],
      ]);
      expect(units(2024)).to.deep.equal([
        [main.id, 700, 700],
        [spouse.id, 0, 0],
      ]);
      expect(units(2023)).to.deep.equal([
        [main.id, 0, 0],
        [spouse.id, 1000, 1000],
      ]);
      expect(units(2022)).to.deep.equal([
        [main.id, 0, 0],
        [spouse.id, 500, 500],
      ]);

      const report2025 = reports.find((r) => r.year === 2025);
      expect(report2025).to.deep.include({ sumDonations: 3000, sumTaxDeductions: 3000 });
      expect(report2025.units[0]).to.deep.include({ name: main.name, ssn: main.ssn });
      expect(report2025.units[0].channels).to.deep.equal([
        { channel: "Gi Effektivt", sumDonations: 500 },
      ]);
      expect(report2025.sumDonationsWithoutTaxUnit.sumDonations).to.equal(0);
      expect(report2025.sumNonDeductibleDonationsByType).to.deep.equal([]);
    });
  });

  it("shows each year's tax units with their sums", () => {
    const unitRow = (year, unit) => yearReport(year).contains("tbody", unit.name);

    unitRow(2025, TAX_UNITS.main)
      .invoke("text")
      .should("match", /500\skr/);
    unitRow(2025, TAX_UNITS.spouse)
      .invoke("text")
      .should("match", /2\s500\skr/);
    unitRow(2024, TAX_UNITS.main)
      .invoke("text")
      .should("match", /700\skr/);
    unitRow(2023, TAX_UNITS.spouse)
      .invoke("text")
      .should("match", /1\s000\skr/);
  });
});
