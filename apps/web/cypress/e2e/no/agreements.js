describe("Agreements page", () => {
  beforeEach(() => {
    cy.login();

    cy.fixture("donor").then((donor) => {
      cy.interceptDonorProfile(donor).as("getDonor");
    });

    cy.fixture("cause_areas_multiple").then((causeAreas) => {
      cy.interceptCauseAreas(causeAreas).as("getCauseAreas");
    });

    cy.fixture("referrals").then((referrals) => {
      cy.interceptTrpc("widget.referralTypes", referrals).as("getReferrals");
    });

    cy.fixture("vipps").then((vipps) => {
      cy.interceptTrpc("minside.vippsAgreements", vipps).as("getVipps");
    });

    cy.fixture("avtalegiro").then((avtalegiro) => {
      cy.interceptTrpc("minside.avtaleGiroAgreements", avtalegiro).as("getAvtalegiro");
    });

    cy.fixture("autogiro").then((vipps) => {
      cy.interceptTrpc("minside.autoGiroAgreements", vipps).as("getAutogiro");
    });

    cy.fixture("kids_agreements").then((kids) => {
      cy.interceptTrpc("minside.distributions", kids).as("getDistribution");

      cy.fixture("taxunits").then((units) => {
        cy.interceptTrpc("minside.taxUnits", units).as("getTaxUnits");
      });
    });

    cy.visit({
      url: `/min-side/avtaler/`,
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });

    /**
     * Wait for initial data load
     */
    cy.wait(
      [
        "@getDonor",
        "@getCauseAreas",
        "@getVipps",
        "@getAvtalegiro",
        "@getAutogiro",
        "@getDistribution",
      ],
      {
        timeout: 30000,
      },
    );
  });

  it("Should display a list of active and inactive agreements", () => {
    cy.get("[data-cy=generic-list-header]").first().should("contain.text", "Aktive");
    cy.get("[data-cy=generic-list-header]").last().should("contain.text", "Inaktive");

    cy.get("[data-cy=generic-list-table]").first().find("tbody").should("have.length", 2);
    cy.get("[data-cy=generic-list-table]").last().find("tbody").should("have.length", 1);

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .should("contain.text", "Vipps");
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .should("contain.text", "Den 10. hver måned");
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .should("contain.text", "100 kr");
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .should("contain.text", "95231965");

    cy.get("[data-cy=generic-list-table]")
      .last()
      .find("tbody")
      .first()
      .should("contain.text", "Vipps");
    cy.get("[data-cy=generic-list-table]")
      .last()
      .find("tbody")
      .first()
      .should("contain.text", "Den 11. hver måned");
    cy.get("[data-cy=generic-list-table]")
      .last()
      .find("tbody")
      .first()
      .should("contain.text", "400 kr");
    cy.get("[data-cy=generic-list-table]")
      .last()
      .find("tbody")
      .first()
      .should("contain.text", "16753477");
  });

  it("Should display correct information in expanded view", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    // Check cause area input
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=cause-area-input]")
      .eq(0)
      .should("contain.value", "100");

    // Check that the distribution is correctly displayed
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(0)
      .should("contain.value", "30");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(2)
      .should("contain.value", "15");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(4)
      .should("contain.value", "25");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(3)
      .should("contain.value", "0");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(0)
      .should("contain.value", "30");
  });

  it("Should calculate the cause area amount from organization amounts", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(4)
      .clear()
      .type("35");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=cause-area-input]")
      .first()
      .should("contain.text", "110");
  });

  // TODO: https://github.com/stiftelsen-effekt/main-site/issues/899
  xit("Should error when trying to save inconsistent agreement state", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    // Create inconsistent distribution
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(4)
      .clear()
      .type("35");

    cy.interceptTrpcError("minside.updateVippsAgreementDistribution", {
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: "Distribution cause areas do not sum to 100",
    });

    /**
     * Stub methods that are not relevant to the update
     */
    cy.interceptTrpc("minside.updateVippsAgreementChargeDay", true);

    cy.interceptTrpc("minside.updateVippsAgreementPrice", true);

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=btn-save-agreement]")
      .click();

    cy.get(".Toastify").contains("Ugyldig data inntastet");
  });

  it("Should be possible to change the agreement distribution", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    // Create a consistent new distribution
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(0)
      .clear()
      .type("25");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]")
      .eq(1)
      .clear()
      .type("20");

    const newKid = "000027123123";
    cy.interceptTrpc("minside.updateVippsAgreementDistribution", { KID: newKid }).as(
      "saveDistribution",
    );

    /**
     * Stub methods that are not relevant to the update
     */
    cy.interceptTrpc("minside.updateVippsAgreementChargeDay", true);

    cy.interceptTrpc("minside.updateVippsAgreementPrice", true);

    /**
     * Stub fetching of agreements with updated information
     */
    cy.fixture("vipps").then((vipps) => {
      cy.interceptTrpc("minside.vippsAgreements", [
        ...vipps.filter((vipps) => vipps.ID != "agr_58LgZZM"),
        {
          ID: "agr_58LgZZM",
          status: "ACTIVE",
          donorID: 14649,
          full_name: "Keef",
          KID: newKid,
          timestamp_created: "2021-05-14T18:19:49.000Z",
          monthly_charge_day: 10,
          force_charge_date: null,
          paused_until_date: null,
          amount: 100,
        },
      ]).as("getVipps");
    });

    cy.fixture("kids_agreements").then((kids) => {
      cy.interceptTrpc("minside.distributions", [
        ...kids.filter((dist) => dist.kid != "95231965"),
        {
          kid: newKid,
          shares: [
            {
              id: 12,
              name: "GiveWells tildelingsfond",
              share: "25.000000000000",
            },
            {
              id: 1,
              name: "Against Malaria Foundation",
              share: "20.000000000000",
            },
            {
              id: 10,
              name: "Hellen Keller International",
              share: "25.000000000000",
            },
            {
              id: 4,
              name: "Malaria Consortium",
              share: "0.000000000000",
            },
            {
              id: 2,
              name: "Schistosomiasis Control Initiative",
              share: "30.000000000000",
            },
            {
              id: 7,
              name: "GiveDirectly",
              share: "0.000000000000",
            },
            {
              id: 13,
              name: "GiveDirectly Borgerlønn",
              share: "0.000000000000",
            },
            {
              id: 14,
              name: "New Incentives",
              share: "0.000000000000",
            },
            {
              id: 11,
              name: "Drift av gieffektivt.no",
              share: "0.000000000000",
            },
          ],
        },
      ]).as("getDistribution");
    });

    // Save agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=btn-save-agreement]")
      .click();

    cy.wait(["@saveDistribution", "@getVipps", "@getDistribution"]);

    cy.get(".Toastify").contains("Lagret");

    cy.get("[data-cy=generic-list-table]").first().find("tbody").should("contain.text", newKid);
  });

  it("Should be possible to change the agreement date", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    // Change the payment date
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=date-picker-input]")
      .click();

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=date-picker-button-13]")
      .click({ force: true });

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=date-picker-input]")
      .should("contain.value", "13.");

    /**
     * Mock returned agreements on mutate
     */
    cy.fixture("vipps").then((vipps) => {
      cy.interceptTrpc("minside.vippsAgreements", [
        ...vipps.filter((vipps) => vipps.ID != "agr_58LgZZM"),
        {
          ID: "agr_58LgZZM",
          status: "ACTIVE",
          donorID: 14649,
          full_name: "Keef",
          KID: "95231965",
          timestamp_created: "2021-05-14T18:19:49.000Z",
          monthly_charge_day: 13,
          force_charge_date: null,
          paused_until_date: null,
          amount: 100,
        },
      ]).as("getVipps");
    });

    cy.interceptTrpc("minside.updateVippsAgreementDistribution", { KID: "95231965" });

    /**
     * Stub methods that are not relevant to the update
     */
    cy.interceptTrpc("minside.updateVippsAgreementChargeDay", true);

    cy.interceptTrpc("minside.updateVippsAgreementPrice", true);

    // Save agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=btn-save-agreement]")
      .click();

    cy.wait(["@getVipps", "@getDistribution"]);

    cy.get("[data-cy=generic-list-table]").first().find("tbody").should("contain.text", "Den 13.");
  });

  it("Should update the agreement sum from the distribution amounts", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=distribution-input]:visible")
      .first()
      .clear()
      .type("1230");

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=agreement-list-amount-input]")
      .should("contain.text", "1 300");

    /**
     * Mock returned agreements on mutate
     */
    cy.fixture("vipps").then((vipps) => {
      cy.interceptTrpc("minside.vippsAgreements", [
        ...vipps.filter((vipps) => vipps.ID != "agr_58LgZZM"),
        {
          ID: "agr_58LgZZM",
          status: "ACTIVE",
          donorID: 14649,
          full_name: "Keef",
          KID: "95231965",
          timestamp_created: "2021-05-14T18:19:49.000Z",
          monthly_charge_day: 10,
          force_charge_date: null,
          paused_until_date: null,
          amount: 1300,
        },
      ]).as("getVipps");
    });

    cy.interceptTrpc("minside.updateVippsAgreementDistribution", { KID: "95231965" }).as(
      "saveDistributionStub",
    );

    /**
     * Stub methods that are not relevant to the update
     */
    cy.interceptTrpc("minside.updateVippsAgreementChargeDay", true).as("changeChargeDayStub");

    cy.interceptTrpc("minside.updateVippsAgreementPrice", true).as("changePriceStub");

    // Save agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=btn-save-agreement]")
      .click();

    cy.wait(["@getVipps", "@getDistribution"]);

    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .should("contain.text", "1\u00A0300 kr");
  });

  it("Should move agreement to inaktive list when cancelling agreement", () => {
    // Expand the first agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=generic-list-row-expand]")
      .first()
      .click();

    /**
     * Mock returned agreements on mutate
     */
    cy.fixture("vipps").then((vipps) => {
      cy.interceptTrpc("minside.vippsAgreements", [
        ...vipps.filter((vipps) => vipps.ID != "agr_58LgZZM"),
        {
          ID: "agr_58LgZZM",
          status: "STOPPED",
          donorID: 14649,
          full_name: "Keef",
          KID: "95231965",
          timestamp_created: "2021-05-14T18:19:49.000Z",
          monthly_charge_day: 10,
          force_charge_date: null,
          paused_until_date: null,
          amount: 100,
        },
      ]).as("getVipps");
    });

    /**
     * Stub methods that are not relevant to the update
     */
    cy.interceptTrpc("minside.cancelVippsAgreement", true);

    // Save agreement
    cy.get("[data-cy=generic-list-table]")
      .first()
      .find("tbody")
      .first()
      .find("[data-cy=btn-cancel-agreement]")
      .click();

    cy.get("[data-cy=lightbox-confirm]").click();

    cy.wait(["@getVipps", "@getDistribution"]);

    cy.get("[data-cy=generic-list-table]").first().find("tbody").should("have.length", 1);

    cy.get("[data-cy=generic-list-table]").last().find("tbody").should("have.length", 2);
  });
});
