/**
 * Full-stack Min Side profile: the profile is read (tRPC minside.profile) and saved
 * (minside.updateProfile) through the real API and database, for the e2e donor written by
 * apps/api/prisma/e2e/seed.mjs ("E2E Testgiver", no newsletter). The data is reset before every test.
 */
import { DONOR_ID } from "../../../../../apps/api/prisma/e2e/data.mjs";
import { trpcData, trpcInput, trpcUrl } from "../../support/trpc";

describe("Profile page (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
    cy.loginFullstack(DONOR_ID);

    cy.intercept("GET", trpcUrl("minside.profile")).as("profile");
    cy.visit("/min-side/profil/");
    cy.wait("@profile", { timeout: 30000 });
  });

  it("saves the donor's name and newsletter choice", () => {
    cy.get("#name").should("have.value", "E2E Testgiver");
    cy.get("#name").clear().type("E2E Endret");
    cy.get("[data-cy=checkbox-newsletter]").click();

    cy.intercept("POST", trpcUrl("minside.updateProfile")).as("save");
    cy.get("[data-cy=btn-save]").click();
    cy.wait("@save").then((interception) => {
      expect(interception.response.statusCode).to.equal(200);
      // The email is not sent: Min Side can't change it
      expect(trpcInput(interception, "minside.updateProfile")).to.deep.equal({
        donorId: DONOR_ID,
        name: "E2E Endret",
        newsletter: true,
      });
      expect(trpcData(interception, "minside.updateProfile")).to.equal(true);
    });
    cy.get(".Toastify").contains("Lagret");

    // Stored: a reload reads it back from the API
    cy.reload();
    cy.wait("@profile").then((interception) => {
      expect(trpcData(interception, "minside.profile")).to.deep.include({
        id: DONOR_ID,
        name: "E2E Endret",
        email: "e2e-donor@example.invalid",
        newsletter: true,
      });
    });
    cy.get("#name").should("have.value", "E2E Endret");
  });

  it("refuses an empty name", () => {
    cy.get("#name").clear();

    cy.intercept("POST", trpcUrl("minside.updateProfile")).as("save");
    cy.get("[data-cy=btn-save]").click();
    cy.wait("@save").its("response.statusCode").should("equal", 400);

    cy.reload();
    cy.get("#name").should("have.value", "E2E Testgiver");
  });
});
