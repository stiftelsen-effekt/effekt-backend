/**
 * Full-stack smoke tests for the public site procedures (tRPC site.*) and the fundraiser widget:
 * the front page's results teaser, the results procedures, and a fundraiser page with a gift
 * registered through widget.registerDonation. The results figures are the fixed EffektAnalysisDB
 * rows from apps/api/prisma/e2e (RESULTS); the fundraiser is fundraiser 11 of the generated dev
 * data, which the production Sanity page "e2e-test-do-not-delete-fundraiser-default" points at.
 *
 * The fundraiser page and the results page are prerendered by `next build`, which calls
 * site.fundraiser and site.*  on the local API. The results page's graphs also need the impact API
 * and Norges Bank (site.monthlyOutputs), so this only checks that the page renders.
 */
import { RESULTS } from "../../../../../apps/api/prisma/e2e/data.mjs";
import { trpcData, trpcInput, trpcUrl } from "../../support/trpc";

const API = Cypress.expose("E2E_API_ORIGIN");
const FUNDRAISER_ID = 11;
const FUNDRAISER_PATH = "/innsamling/e2e-test-do-not-delete-fundraiser-default";

const digits = (text) => text.replace(/\D/g, "");

/** Clicks until the target shows: the fundraiser widget's panes animate in (as in no/fundraiser-widget.cy.js) */
const clickUntilVisible = (clickSelector, visibleSelector, attempts = 10) => {
  if (attempts === 0) throw new Error(`${visibleSelector} never became visible`);
  cy.get(clickSelector).click();
  cy.wait(300);
  cy.get(visibleSelector).then(($el) => {
    if (!$el.is(":visible") && Cypress.$(clickSelector).is(":visible")) {
      clickUntilVisible(clickSelector, visibleSelector, attempts - 1);
    }
  });
};

/** GET a public tRPC query on the local API */
const trpcQuery = (path, input) =>
  cy
    .request(
      `${API}/trpc/${path}` +
        (input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`),
    )
    .its("body.result.data");

describe("Results (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
  });

  it("shows the seeded headline figures in the front page's results teaser", () => {
    cy.intercept("GET", trpcUrl("site.resultsHeadline")).as("headline");
    cy.visit({ url: "/", headers: { "x-vercel-skip-toolbar": "1" } });

    cy.wait("@headline", { timeout: 30000 }).then((interception) => {
      expect(trpcData(interception, "site.resultsHeadline")).to.include(RESULTS.headline);
    });
    cy.get("[data-cy=results-teaser-sum]")
      .invoke("text")
      .should((text) =>
        expect(digits(text)).to.equal(
          String(Math.round(Number(RESULTS.headline.totalDonationsToRecommendedOrgs))),
        ),
      );
    cy.get("[data-cy=results-teaser-donors]")
      .invoke("text")
      .should((text) => expect(digits(text)).to.equal(String(RESULTS.headline.numberOfDonors)));
  });

  it("answers the results page's reads from the analysis database", () => {
    trpcQuery("site.dailyDonations").should(
      "deep.equal",
      RESULTS.daily.map(([date, sum]) => ({ date: `${date}T00:00:00.000Z`, sum })),
    );
    trpcQuery("site.referralSums").then((rows) => {
      expect(rows.map((row) => row.Year)).to.deep.equal(RESULTS.referralYears);
      expect(rows[0].Total_sum_web_ref).to.equal(RESULTS.referralValue);
    });
  });

  it("renders the results page", () => {
    cy.request("/resultater").its("status").should("equal", 200);
  });
});

describe("Fundraiser page (full stack)", () => {
  beforeEach(() => {
    cy.task("resetE2EData");
  });

  it("shows the fundraiser's total from the database", () => {
    // The total the page was prerendered with (site.fundraiser at build time)
    cy.task("queryE2EDb", {
      sql: `SELECT COALESCE(SUM(don.sum_confirmed), 0) AS total
              FROM Fundraiser_transactions ft
              JOIN Distributions d ON d.Fundraiser_transaction_ID = ft.ID
              JOIN Donations don ON don.KID_fordeling = d.KID
             WHERE ft.Fundraiser_ID = ?`,
      params: [FUNDRAISER_ID],
    }).then(([{ total }]) => {
      expect(Number(total)).to.be.greaterThan(0);
      trpcQuery("site.fundraiser", { id: FUNDRAISER_ID })
        .its("totalSum")
        .should("equal", Number(total));

      cy.visit({ url: FUNDRAISER_PATH, headers: { "x-vercel-skip-toolbar": "1" } });
      cy.get("[data-cy=fundraiser-progress-current]")
        .invoke("text")
        .should((text) => expect(digits(text)).to.equal(String(Math.round(Number(total)))));
      cy.get("[data-cy=fundraiser-gift-item]").should("have.length.at.least", 1);
    });
  });

  it("registers a bank gift to the fundraiser through widget.registerDonation", () => {
    const message = `E2E gift ${Date.now()}`;
    cy.intercept("POST", trpcUrl("widget.registerDonation")).as("register");

    cy.visit({ url: FUNDRAISER_PATH, headers: { "x-vercel-skip-toolbar": "1" } });
    cy.get("[data-cy='fundraiser-widget']", { timeout: 10000 }).should("exist");

    cy.get("[data-cy='fundraiser-pane-organization']").should("be.visible");
    clickUntilVisible(
      "[data-cy='fundraiser-start-button']",
      "[data-cy='fundraiser-pane-donation']",
    );
    cy.get("[data-cy='fundraiser-pane-donation']").should("be.visible");
    cy.get("[data-cy='fundraiser-amount-input']").clear({ force: true }).type("250");
    cy.get("[data-cy='fundraiser-message-input']").clear().type(message);
    cy.get("[data-cy='fundraiser-donation-next']").click();
    cy.get("[data-cy='fundraiser-pane-payment']").should("be.visible");

    cy.get("[data-cy='fundraiser-method-bank']").click({ force: true });
    cy.get("[data-cy='fundraiser-submit-button']").click({ force: true });

    cy.wait("@register", { timeout: 30000 }).then((interception) => {
      const input = trpcInput(interception, "widget.registerDonation");
      expect(input.amount).to.equal(250);
      expect(input.fundraiser).to.include({ message, showName: false });

      const { KID } = trpcData(interception, "widget.registerDonation");
      cy.get("[data-cy='fundraiser-kid']").should("contain", KID);

      cy.task("queryE2EDb", {
        sql: `SELECT ft.Fundraiser_ID AS fundraiserId, ft.Message AS message
                FROM Distributions d
                JOIN Fundraiser_transactions ft ON ft.ID = d.Fundraiser_transaction_ID
               WHERE d.KID = ?`,
        params: [KID],
      }).then((rows) => {
        expect(rows).to.deep.equal([{ fundraiserId: FUNDRAISER_ID, message }]);
      });
    });
  });
});
