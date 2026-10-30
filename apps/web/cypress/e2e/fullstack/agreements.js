/**
 * Full-stack version of cypress/e2e/no/agreements.js: the page talks to the real API and
 * database (compose.e2e.yml), so the assertions are against the e2e donor written by
 * prisma/e2e/seed.mjs. The data is reset before every test.
 *
 * Not covered here: changing the amount of, or cancelling, a Vipps agreement. Both call the Vipps
 * API first, which the local stack has no credentials or stub for (see docs/e2e.md).
 */
import { DONOR_ID, KIDS } from "../../../../../prisma/e2e/data.mjs";

const activeTable = () => cy.get("[data-cy=generic-list-table]").first();
const inactiveTable = () => cy.get("[data-cy=generic-list-table]").last();

/** The row (tbody) of the agreement with this KID in the given table */
const agreementRow = (table, kid) => table().contains("tbody", kid);

const expand = (kid) =>
  agreementRow(activeTable, kid).find("[data-cy=generic-list-row-expand]").first().click();

/** The amount input of one organization in an expanded agreement */
const organizationInput = (kid, organization) =>
  agreementRow(activeTable, kid)
    .contains("span", organization)
    .parent()
    .find("[data-cy=distribution-input]");

const save = (kid) => agreementRow(activeTable, kid).find("[data-cy=btn-save-agreement]").click();

describe("Agreements page (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
    cy.loginFullstack(DONOR_ID);

    cy.intercept("GET", "**/donors/*/recurring/vipps/").as("getVipps");
    cy.intercept("GET", "**/donors/*/recurring/avtalegiro/").as("getAvtalegiro");

    cy.visit("/min-side/avtaler/");
    cy.wait(["@getVipps", "@getAvtalegiro"], { timeout: 30000 });
  });

  it("lists the donor's active and inactive agreements", () => {
    cy.get("[data-cy=generic-list-header]").first().should("contain.text", "Aktive");
    cy.get("[data-cy=generic-list-header]").last().should("contain.text", "Inaktive");

    // Vipps x2, AvtaleGiro x2, AutoGiro
    activeTable().find("tbody").should("have.length", 5);
    inactiveTable().find("tbody").should("have.length", 1);

    agreementRow(activeTable, KIDS.vippsCustom)
      .should("contain.text", "Vipps")
      .and("contain.text", "Den 10. hver måned")
      .and("contain.text", "100 kr");
    agreementRow(activeTable, KIDS.vippsStandard)
      .should("contain.text", "Vipps")
      .and("contain.text", "Den 20. hver måned")
      .and("contain.text", "250 kr");
    agreementRow(activeTable, KIDS.avtalegiro)
      .should("contain.text", "AvtaleGiro")
      .and("contain.text", "Den 15. hver måned")
      .and("contain.text", "500 kr");
    agreementRow(activeTable, KIDS.autogiro)
      .should("contain.text", "AutoGiro")
      .and("contain.text", "Den 25. hver måned")
      .and("contain.text", "200 kr");

    agreementRow(inactiveTable, KIDS.vippsStopped)
      .should("contain.text", "Vipps")
      .and("contain.text", "Den 11. hver måned")
      .and("contain.text", "400 kr");
  });

  it("shows the stored distribution in the expanded view", () => {
    expand(KIDS.vippsCustom);

    agreementRow(activeTable, KIDS.vippsCustom)
      .find("[data-cy=agreement-list-amount-input]")
      .should("contain.text", "100");
    organizationInput(KIDS.vippsCustom, "All Grants").should("have.value", "30");
    organizationInput(KIDS.vippsCustom, "Helen Keller").should("have.value", "15");
    organizationInput(KIDS.vippsCustom, "New Incentives").should("have.value", "25");
    organizationInput(KIDS.vippsCustom, "Against Malaria").should("have.value", "30");
  });

  it("recalculates the agreement sum from the organization amounts", () => {
    expand(KIDS.vippsCustom);

    organizationInput(KIDS.vippsCustom, "New Incentives").clear().type("35");

    agreementRow(activeTable, KIDS.vippsCustom)
      .find("[data-cy=agreement-list-amount-input]")
      .should("contain.text", "110");
  });

  it("saves a new distribution for a Vipps agreement", () => {
    expand(KIDS.vippsCustom);

    // Same sum (100 kr), so only the distribution changes and Vipps itself is not called
    organizationInput(KIDS.vippsCustom, "All Grants").clear().type("25");
    organizationInput(KIDS.vippsCustom, "Helen Keller").clear().type("20");

    cy.intercept("PUT", "**/donors/*/recurring/vipps/*/distribution").as("saveDistribution");
    save(KIDS.vippsCustom);

    cy.wait("@saveDistribution").then(({ response }) => {
      expect(response.statusCode).to.equal(200);
      const newKid = response.body.content.KID;
      expect(newKid).to.match(/^\d+$/).and.not.equal(KIDS.vippsCustom);

      cy.get(".Toastify").contains("Lagret");
      // The list is refetched from the API: the agreement now points at the new KID
      activeTable().find("tbody").should("contain.text", newKid);
      activeTable().find("tbody").should("not.contain.text", KIDS.vippsCustom);

      // ...and the change survives a reload, so it was stored
      cy.reload();
      agreementRow(activeTable, newKid).find("[data-cy=generic-list-row-expand]").first().click();
      agreementRow(activeTable, newKid)
        .contains("span", "All Grants")
        .parent()
        .find("[data-cy=distribution-input]")
        .should("have.value", "25");
    });
  });

  it("changes the charge day of a Vipps agreement", () => {
    expand(KIDS.vippsStandard);

    agreementRow(activeTable, KIDS.vippsStandard).find("[data-cy=date-picker-input]").click();
    agreementRow(activeTable, KIDS.vippsStandard)
      .find("[data-cy=date-picker-button-13]")
      .click({ force: true });
    agreementRow(activeTable, KIDS.vippsStandard)
      .find("[data-cy=date-picker-input]")
      .should("contain.value", "13.");

    cy.intercept("PUT", "**/donors/*/recurring/vipps/*/chargeday").as("saveChargeDay");
    save(KIDS.vippsStandard);
    cy.wait("@saveChargeDay").its("response.statusCode").should("equal", 200);

    cy.get(".Toastify").contains("Lagret");
    cy.reload();
    agreementRow(activeTable, KIDS.vippsStandard).should("contain.text", "Den 13. hver måned");
  });

  it("changes the amount of an AvtaleGiro agreement", () => {
    expand(KIDS.avtalegiro);

    // Three active cause areas: the sum is entered per cause area (Global helse is the first)
    agreementRow(activeTable, KIDS.avtalegiro)
      .find("input[data-cy=cause-area-input]")
      .first()
      .clear()
      .type("750");
    agreementRow(activeTable, KIDS.avtalegiro)
      .find("[data-cy=agreement-list-amount-input]")
      .should("contain.text", "750");

    cy.intercept("POST", "**/avtalegiro/*/amount").as("saveAmount");
    save(KIDS.avtalegiro);
    cy.wait("@saveAmount").its("response.statusCode").should("equal", 200);

    cy.get(".Toastify").contains("Lagret");
    cy.reload();
    agreementRow(activeTable, KIDS.avtalegiro).should("contain.text", "750 kr");
  });

  it("moves a cancelled AvtaleGiro agreement to the inactive list", () => {
    expand(KIDS.avtalegiroToCancel);

    agreementRow(activeTable, KIDS.avtalegiroToCancel)
      .find("[data-cy=btn-cancel-agreement]")
      .click();
    cy.get("[data-cy=lightbox-confirm]").click();

    activeTable().find("tbody").should("have.length", 4);
    inactiveTable().find("tbody").should("have.length", 2);
    agreementRow(inactiveTable, KIDS.avtalegiroToCancel).should("contain.text", "AvtaleGiro");

    cy.reload();
    agreementRow(inactiveTable, KIDS.avtalegiroToCancel).should("exist");
  });
});
