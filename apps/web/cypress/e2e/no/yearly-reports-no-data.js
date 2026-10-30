describe("Tax reports page no data", () => {
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

    cy.fixture("tax-reports/empty").then((reports) => {
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

  it("should display custom message if no data", () => {
    cy.get("[data-cy=generic-list-header-title]").should("contain.text", "2025");
    cy.get("[data-cy=generic-list-empty-placeholder]").should(
      "contain.text",
      "Vi har ikke registrert noen donasjoner på deg i 2025.",
    );
  });

  /*
  it("should show crypto and stiftelsen effekt donations in separate table"),
  
  
  */
});
