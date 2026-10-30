/**
 * Full-stack Min Side tax units (Skatt): the tax units and their yearly sums come from the real API
 * (tRPC minside.taxUnits) and database, for the e2e donor written by apps/api/prisma/e2e/seed.mjs. The bank
 * transfers (500 kr in 2022, 1 000 kr in 2023, 2 500 kr in 2025) belong to the second tax unit,
 * the Vipps and AvtaleGiro donations (700 kr in 2024, 500 kr in 2025) to the first. Creating,
 * changing and deleting tax units go through minside.createTaxUnit, updateTaxUnit and deleteTaxUnit.
 */

/** A valid (synthetic) fødselsnummer that isn't one of the seeded units' */
const NEW_SSN = "15868520008";

/** Opens the context menu of a tax unit's list and picks `option` ("Endre" or "Slett") */
const contextMenu = (unit, option) => {
  taxUnitList(unit).find("[data-cy=generic-list-row-context]").first().click();
  taxUnitList(unit).contains("span", option).click();
};

const lightboxInput = (index) =>
  cy.get("[data-cy=lightbox]:visible input:not([type=radio])").eq(index);
import { DONOR_ID, TAX_UNITS } from "../../../../../apps/api/prisma/e2e/data.mjs";
import { trpcData, trpcError, trpcInput, trpcUrl } from "../../support/trpc";

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

  it("creates a tax unit", () => {
    cy.get("[data-cy=btn-create-tax-unit]").click();
    lightboxInput(0).type("E2E Barn");
    lightboxInput(1).type(NEW_SSN);

    cy.intercept("POST", trpcUrl("minside.createTaxUnit")).as("create");
    cy.get("[data-cy=lightbox]:visible [data-cy=lightbox-confirm]").click();
    cy.wait("@create").then((interception) => {
      expect(interception.response.statusCode).to.equal(200);
      expect(trpcInput(interception, "minside.createTaxUnit")).to.deep.equal({
        donorId: DONOR_ID,
        name: "E2E Barn",
        ssn: NEW_SSN,
      });
      expect(trpcData(interception, "minside.createTaxUnit")).to.deep.include({
        donorId: DONOR_ID,
        name: "E2E Barn",
        ssn: NEW_SSN,
        archived: null,
      });
    });

    // The list is revalidated, and the unit is stored
    taxUnitList({ name: "E2E Barn" }).should("exist");
    cy.reload();
    cy.wait("@taxUnits").then((interception) => {
      const units = trpcData(interception, "minside.taxUnits");
      expect(units.map((u) => u.ssn)).to.include(NEW_SSN);
    });
  });

  it("changes a tax unit's name", () => {
    contextMenu(TAX_UNITS.spouse, "Endre");
    lightboxInput(0).clear().type("E2E Ektefelle Endret");

    cy.intercept("POST", trpcUrl("minside.updateTaxUnit")).as("update");
    cy.get("[data-cy=lightbox]:visible [data-cy=lightbox-confirm]").click();
    cy.wait("@update").then((interception) => {
      expect(interception.response.statusCode).to.equal(200);
      expect(trpcInput(interception, "minside.updateTaxUnit")).to.deep.equal({
        donorId: DONOR_ID,
        taxUnitId: TAX_UNITS.spouse.id,
        name: "E2E Ektefelle Endret",
        ssn: TAX_UNITS.spouse.ssn,
      });
    });

    taxUnitList({ name: "E2E Ektefelle Endret" }).should("exist");
    cy.reload();
    taxUnitList({ name: "E2E Ektefelle Endret" }).should("contain.text", "158685 10126");
  });

  it("fails to delete a tax unit, as the backend hasn't implemented it", () => {
    // DAO.tax.deleteById throws "Not implemented", so REST DELETE /donors/:id/taxunits/:id answers
    // 500 as well. Update this test when deleting is implemented.
    contextMenu(TAX_UNITS.spouse, "Slett");

    cy.intercept("POST", trpcUrl("minside.deleteTaxUnit")).as("delete");
    cy.get("[data-cy=lightbox]:visible [data-cy=lightbox-confirm]").click();
    cy.wait("@delete").then((interception) => {
      expect(trpcInput(interception, "minside.deleteTaxUnit")).to.deep.equal({
        donorId: DONOR_ID,
        taxUnitId: TAX_UNITS.spouse.id,
        transferTaxUnitId: null,
      });
      expect(trpcError(interception, "minside.deleteTaxUnit").data.httpStatus).to.equal(500);
    });

    cy.reload();
    taxUnitList(TAX_UNITS.spouse).should("exist");
  });
});
