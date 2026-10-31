/**
 * Full-stack donation widget: a one-off bank transfer and a monthly AvtaleGiro registered through
 * the real API (tRPC widget.causeAreas, widget.referralTypes, widget.registerDonation,
 * widget.registerBankPending, widget.draftAvtaleGiro) into the database. No payment provider is
 * involved (the hand-over to Mastercard Payment Services is stubbed), and the emails have no
 * Mailersend key locally, so nothing leaves the stack.
 */
import { trpcData, trpcInput, trpcUrl } from "../../support/trpc";

const API = Cypress.expose("E2E_API_ORIGIN");

const openWidget = () => {
  cy.visit({ url: "/", headers: { "x-vercel-skip-toolbar": "1" } });
  cy.wait(["@causeAreas", "@referralTypes"], { timeout: 30000 }).then(([causeAreas]) => {
    expect(trpcData(causeAreas, "widget.causeAreas")).to.have.length.at.least(1);
  });

  cy.get("[data-cy=gi-button]").should("be.visible").click();
  cy.get("[data-cy=widget-pane]").should("be.visible");
};

const fillDonor = (email) => {
  cy.get("[data-cy=name-input]").type("Widget E2E");
  cy.get("[data-cy=email-input]").type(email);
  cy.get("body").then(($body) => {
    if ($body.find("[data-cy=privacy-policy-checkbox]").length) {
      cy.get("[data-cy=privacy-policy-checkbox]").check({ force: true });
    }
  });
};

describe("Donation widget (full stack)", () => {
  beforeEach(() => {
    cy.intercept("GET", trpcUrl("widget.causeAreas")).as("causeAreas");
    cy.intercept("GET", trpcUrl("widget.referralTypes")).as("referralTypes");
    cy.intercept("POST", trpcUrl("widget.registerDonation")).as("register");
  });

  it("registers a one-off bank donation and shows its KID", () => {
    const email = `widget-e2e-${Date.now()}@example.org`;
    const sum = 350;

    cy.intercept("POST", trpcUrl("widget.registerBankPending")).as("bankPending");

    openWidget();

    // Global health (cause area 1 in the seeded data), one-off
    cy.get('[data-cy="cause-area-1"]').click();
    cy.get('[data-cy="single-donation-radio"]').click({ force: true });
    cy.get("[data-cy^=donation-sum-input-]").first().type(String(sum));
    cy.nextWidgetPane();

    fillDonor(email);
    // Choosing bank transfer registers the donation
    cy.get("[data-cy=payment-method-bank]").click({ force: true });

    cy.wait("@register", { timeout: 30000 }).then((interception) => {
      const input = trpcInput(interception, "widget.registerDonation");
      expect(input.amount).to.equal(sum);
      expect(input.donor.email).to.equal(email);

      const registered = trpcData(interception, "widget.registerDonation");
      const { KID, registrationToken } = registered;
      expect(KID).to.match(/^\d{8}$/);
      expect(registered).to.not.have.property("donorID");
      expect(registrationToken).to.be.a("string");
      cy.get("[data-cy=kidNumber]").should("contain.text", KID);

      cy.task("queryE2EDb", {
        sql: "SELECT d.KID, o.email FROM Distributions d JOIN Donors o ON o.ID = d.Donor_ID WHERE d.KID = ?",
        params: [KID],
      }).then((rows) => {
        expect(rows).to.deep.equal([{ KID, email }]);
      });
      cy.task("queryE2EDb", {
        sql: "SELECT Payment_method, Payment_amount FROM Payment_intent WHERE KID_fordeling = ?",
        params: [KID],
      }).then((rows) => {
        expect(rows).to.have.length(1);
        expect(Number(rows[0].Payment_amount)).to.equal(sum);
      });

      cy.wait("@bankPending").then((pending) => {
        expect(trpcInput(pending, "widget.registerBankPending")).to.deep.equal({
          KID,
          sum,
          registrationToken,
        });
        expect(pending.response.statusCode).to.equal(200);
      });
    });
  });

  it("drafts a monthly AvtaleGiro for the KID it registered, and for no other", () => {
    const email = `widget-e2e-ag-${Date.now()}@example.org`;
    const sum = 400;

    cy.intercept("POST", trpcUrl("widget.draftAvtaleGiro")).as("draftAvtaleGiro");

    openWidget();

    // Global health, monthly
    cy.get('[data-cy="cause-area-1"]').click();
    cy.get('[data-cy="recurring-donation-radio"]').click({ force: true });
    cy.get("[data-cy^=donation-sum-input-]").first().type(String(sum));
    cy.nextWidgetPane();

    fillDonor(email);
    // Choosing AvtaleGiro registers the donation and opens the AvtaleGiro pane
    cy.get("[data-cy=payment-method-avtalegiro]").click({ force: true });

    cy.wait("@register", { timeout: 30000 }).then((interception) => {
      const { KID, registrationToken } = trpcData(interception, "widget.registerDonation");
      expect(KID).to.match(/^\d+$/);

      // The widget hands the donor over to Mastercard Payment Services with the form's native
      // submit(): stub it, so the test stays on the page
      cy.window().then((win) => {
        cy.stub(win.HTMLFormElement.prototype, "submit").as("formSubmit");
      });
      cy.get("[data-cy=avtalegiro-form] button").click({ force: true });

      cy.wait("@draftAvtaleGiro").then((draft) => {
        expect(trpcInput(draft, "widget.draftAvtaleGiro")).to.include({
          KID,
          amount: sum,
          registrationToken,
        });
        expect(draft.response.statusCode).to.equal(200);
      });
      cy.get("@formSubmit").should("have.been.calledOnce");

      cy.task("queryE2EDb", {
        sql: "SELECT amount, active, notice FROM Avtalegiro_agreements WHERE KID = ?",
        params: [KID],
      }).then((rows) => {
        expect(rows).to.have.length(1);
        expect(rows[0].amount).to.equal(sum * 100);
        expect(Number(rows[0].active)).to.equal(0);
      });

      // Sending the same draft again (a retry) keeps the one row
      cy.request({
        method: "POST",
        url: `${API}/trpc/widget.draftAvtaleGiro`,
        body: { KID, amount: sum, dueDay: 0, registrationToken },
      })
        .its("status")
        .should("equal", 200);

      // Another KID, with this token or none, is refused and gets no agreement
      const countFor = (kid) =>
        cy
          .task("queryE2EDb", {
            sql: "SELECT COUNT(*) AS n FROM Avtalegiro_agreements WHERE KID = ?",
            params: [kid],
          })
          .then((rows) => Number(rows[0].n));
      countFor("12345678").then((before) => {
        for (const body of [
          { KID: "12345678", amount: 100, registrationToken },
          { KID, amount: 100 },
        ]) {
          cy.request({
            method: "POST",
            url: `${API}/trpc/widget.draftAvtaleGiro`,
            body,
            failOnStatusCode: false,
          })
            .its("status")
            .should("equal", 400);
        }
        countFor("12345678").should("equal", before);
      });

      cy.task("queryE2EDb", {
        sql: "SELECT amount FROM Avtalegiro_agreements WHERE KID = ?",
        params: [KID],
      }).then((rows) => {
        expect(rows).to.deep.equal([{ amount: sum * 100 }]);
      });
    });
  });
});
