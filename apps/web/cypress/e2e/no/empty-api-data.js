describe("Profile and dashboard empty API data", () => {
  beforeEach(() => {
    cy.login();
  });

  it("shows the profile no data message when donor data is empty", () => {
    cy.interceptDonorProfile([]).as("getDonor");

    cy.visit({
      url: "/min-side/profil/",
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });

    cy.wait("@getDonor", { timeout: 30000 });
    cy.contains("h1", "No data available").should("be.visible");
  });

  it("shows the donations empty placeholder when donations are empty", () => {
    cy.fixture("donor").then((donor) => {
      cy.interceptDonorProfile(donor).as("getDonor");
    });

    cy.interceptTrpc("minside.donations", []).as("getDonations");

    cy.interceptTrpc("minside.donationsAggregated", []).as("getAggregated");

    cy.interceptTrpc("minside.distributions", []).as("getDistribution");

    cy.fixture("organizations").then((organizations) => {
      cy.interceptTrpc("site.organizations", organizations).as("getOrganizations");
    });

    cy.interceptTrpc("minside.taxUnits", []).as("getTaxUnits");

    cy.visit({
      url: "/min-side/",
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });

    cy.wait(["@getDonor", "@getDonations", "@getAggregated", "@getOrganizations", "@getTaxUnits"], {
      timeout: 30000,
    });
    cy.get("[data-cy=generic-list-empty-placeholder]").should(
      "contain.text",
      "Vi har ikke registrert noen donasjoner fra deg",
    );
    cy.get("@getDistribution.all").should("have.length", 0);
  });

  it("shows the agreements empty placeholders when agreements are empty arrays", () => {
    cy.fixture("donor").then((donor) => {
      cy.interceptDonorProfile(donor).as("getDonor");
    });

    cy.interceptTrpc("minside.vippsAgreements", []).as("getVipps");

    cy.interceptTrpc("minside.avtaleGiroAgreements", []).as("getAvtalegiro");

    cy.interceptTrpc("minside.autoGiroAgreements", []).as("getAutogiro");

    cy.interceptTrpc("minside.distributions", []).as("getDistribution");

    cy.interceptTrpc("minside.taxUnits", []).as("getTaxUnits");

    cy.visit({
      url: "/min-side/avtaler/",
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });

    cy.wait(["@getDonor", "@getVipps", "@getAvtalegiro", "@getAutogiro", "@getTaxUnits"], {
      timeout: 30000,
    });
    cy.get("[data-cy=agreement-list-empty-placeholder]").should("have.length", 2);
    cy.get("@getDistribution.all").should("have.length", 0);
  });
});
