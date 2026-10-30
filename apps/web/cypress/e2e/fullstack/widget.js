/**
 * Full-stack donation widget: a one-off bank transfer registered through the real API (tRPC
 * widget.causeAreas, widget.referralTypes, widget.registerDonation, widget.registerBankPending)
 * into the database. No payment provider is involved for a bank transfer, and the "how to pay"
 * email has no Mailersend key locally, so nothing leaves the stack.
 */
import { trpcData, trpcInput, trpcUrl } from "../../support/trpc";

describe("Donation widget (full stack)", () => {
  it("registers a one-off bank donation and shows its KID", () => {
    const email = `widget-e2e-${Date.now()}@example.org`;
    const sum = 350;

    cy.intercept("GET", trpcUrl("widget.causeAreas")).as("causeAreas");
    cy.intercept("GET", trpcUrl("widget.referralTypes")).as("referralTypes");
    cy.intercept("POST", trpcUrl("widget.registerDonation")).as("register");
    cy.intercept("POST", trpcUrl("widget.registerBankPending")).as("bankPending");

    cy.visit({ url: "/", headers: { "x-vercel-skip-toolbar": "1" } });
    cy.wait(["@causeAreas", "@referralTypes"], { timeout: 30000 }).then(([causeAreas]) => {
      expect(trpcData(causeAreas, "widget.causeAreas")).to.have.length.at.least(1);
    });

    cy.get("[data-cy=gi-button]").should("be.visible").click();
    cy.get("[data-cy=widget-pane]").should("be.visible");

    // Global health (cause area 1 in the seeded data), one-off
    cy.get('[data-cy="cause-area-1"]').click();
    cy.get('[data-cy="single-donation-radio"]').click({ force: true });
    cy.get("[data-cy^=donation-sum-input-]").first().type(String(sum));
    cy.nextWidgetPane();

    cy.get("[data-cy=name-input]").type("Widget E2E");
    cy.get("[data-cy=email-input]").type(email);
    cy.get("body").then(($body) => {
      if ($body.find("[data-cy=privacy-policy-checkbox]").length) {
        cy.get("[data-cy=privacy-policy-checkbox]").check({ force: true });
      }
    });
    // Choosing bank transfer registers the donation
    cy.get("[data-cy=payment-method-bank]").click({ force: true });

    cy.wait("@register", { timeout: 30000 }).then((interception) => {
      const input = trpcInput(interception, "widget.registerDonation");
      expect(input.amount).to.equal(sum);
      expect(input.donor.email).to.equal(email);

      const { KID, donorID } = trpcData(interception, "widget.registerDonation");
      expect(KID).to.match(/^\d{8}$/);
      cy.get("[data-cy=kidNumber]").should("contain.text", KID);

      cy.task("queryE2EDb", {
        sql: "SELECT d.KID, d.Donor_ID, o.email FROM Distributions d JOIN Donors o ON o.ID = d.Donor_ID WHERE d.KID = ?",
        params: [KID],
      }).then((rows) => {
        expect(rows).to.deep.equal([{ KID, Donor_ID: donorID, email }]);
      });
      cy.task("queryE2EDb", {
        sql: "SELECT Payment_method, Payment_amount FROM Payment_intent WHERE KID_fordeling = ?",
        params: [KID],
      }).then((rows) => {
        expect(rows).to.have.length(1);
        expect(Number(rows[0].Payment_amount)).to.equal(sum);
      });

      cy.wait("@bankPending").then((pending) => {
        expect(trpcInput(pending, "widget.registerBankPending")).to.deep.equal({ KID, sum });
      });
    });
  });
});
