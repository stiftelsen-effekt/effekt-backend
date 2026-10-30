describe("Tax reports page with ea funds donations", () => {
  beforeEach(() => {
    cy.login();

    cy.fixture("donor").then((donor) => {
      cy.interceptDonorProfile(donor).as("getDonor");
    });

    cy.fixture("cause_areas").then((causeAreas) => {
      cy.interceptTrpc("widget.causeAreas", causeAreas).as("getCauseAreas");
    });

    cy.fixture("referrals").then((referrals) => {
      cy.interceptTrpc("widget.referralTypes", referrals).as("getReferrals");
    });

    cy.fixture("tax-reports/crypto").then((reports) => {
      cy.interceptTrpc("minside.taxReports", reports).as("getReports");
    });

    cy.fixture("donations")
      .then((donations) => {
        cy.interceptTrpc("minside.donations", donations);
      })
      .as("getDonations");

    cy.fixture("kids_donations")
      .then((kids) => {
        cy.interceptTrpc("minside.distributions", kids);
      })
      .as("getDistribution");

    cy.visit({
      url: `/min-side/skatt/aarsoppgaver`,
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });

    /**
     * Wait for initial data load
     */
    cy.wait(["@getDonor", "@getCauseAreas", "@getReports", "@getDonations", "@getDistribution"], {
      timeout: 30000,
    });
  });

  it("should contain info icon with tooltip in unit table title", () => {
    cy.get("[data-cy=yearly-tax-report-non-deductable-table]")
      .first()
      .find("thead")
      .find("[data-cy=tax-report-tooltip-icon]")
      .should("be.visible");

    cy.get("[data-cy=lightbox]").should("not.exist");

    cy.get("[data-cy=yearly-tax-report-non-deductable-table]")
      .first()
      .find("thead")
      .find("[data-cy=tax-report-tooltip-icon]")
      .click();

    cy.get("[data-cy=lightbox]").should("be.visible");
  });

  it("should display the correct information in the non deductable donations unit table", () => {
    cy.get("[data-cy=yearly-tax-report-non-deductable-table]")
      .first()
      .find("tbody tr")
      .should("have.length", 1);

    cy.get("[data-cy=yearly-tax-report-non-deductable-table]")
      .first()
      .find("tbody tr")
      .first()
      .should("contain.text", "Crypto");
    cy.get("[data-cy=yearly-tax-report-non-deductable-table]")
      .first()
      .find("tbody tr")
      .first()
      .should("contain.text", "20\u00A0000");
  });
});
