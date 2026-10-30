import { trpcUrl } from "../../support/trpc";
import mockDonor from "../../fixtures/no/donor.json";

describe("Widget", () => {
  beforeEach(() => {
    cy.fixture("cause_areas").then((causeAreas) => {
      cy.interceptCauseAreas(causeAreas).as("getCauseAreas");
    });

    cy.fixture("referrals").then((referrals) => {
      cy.interceptTrpc("widget.referralTypes", referrals).as("getReferrals");
    });

    cy.visit({
      url: "/",
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });
    cy.wait("@getCauseAreas");
    cy.get("[data-cy=gi-button]").should("be.visible").click();
    cy.get("[data-cy=widget-pane]").should("be.visible");
  });

  it("End-2-End single bank donation", () => {
    const randomSum = Math.floor(Math.random() * 1000) + 100;
    cy.pickSingleDonation();
    cy.get("[data-cy^=donation-sum-input]").type(randomSum.toString());
    cy.nextWidgetPane();

    cy.pickAnonymous();
    cy.get("[data-cy=payment-method-bank]").click({ force: true });

    cy.interceptTrpc("widget.registerDonation", {
      KID: "87397824",
      donorID: 1464,
      hasAnsweredReferral: false,
      paymentProviderUrl: "",
    }).as("registerDonation");

    cy.interceptTrpc("widget.registerBankPending", true).as("bankPending");

    cy.nextWidgetPane();

    cy.get("[data-cy=kidNumber]").should(($kid) => {
      const kid = $kid.text();
      expect(kid).to.be.length(8);
    });
  });

  it("End-2-End recurring avtalegiro donation", () => {
    /**
     * Ignore iframeLoaded error on nets iframe
     */
    cy.origin("https://pvu.nets.no", () => {
      cy.on("uncaught:exception", (e) => {
        if (e.message.includes("iframeLoaded is not defined")) {
          // we expected this error, so let's ignore it
          // and let the test continue
          return false;
        }
      });
    });

    const randomSum = Math.floor(Math.random() * 1000) + 100;
    cy.pickRecurringDonation();
    cy.get("[data-cy^=donation-sum-input]").type(randomSum.toString());
    cy.nextWidgetPane();

    cy.pickAnonymous();
    cy.get("[data-cy=payment-method-avtalegiro]").click({ force: true });
    cy.wait(500);

    cy.interceptTrpc("widget.registerDonation", {
      KID: "87397824",
      donorID: 1464,
      hasAnsweredReferral: false,
      paymentProviderUrl: "",
    }).as("registerDonation");

    cy.intercept("POST", trpcUrl("widget.draftAvtaleGiro"), (req) => {
      expect(req.body.amount).to.equal(randomSum);
      expect(req.body.KID).to.equal("87397824");
      expect(req.body.sum).to.be.undefined;
      req.reply({ statusCode: 200, body: { result: { data: true } } });
    }).as("draftAvtaleGiro");

    cy.nextWidgetPane();
    cy.wait(500);

    // The form's own native submit goes straight to the external
    // avtalegiro.no page (its action is that URL), bypassing the button's
    // onClick handler that actually dispatches the draftAvtaleGiro saga and
    // calls widget.draftAvtaleGiro - so the button itself must be clicked, not
    // the form submitted directly, to exercise that request. But the saga
    // itself calls the form's native submit() on success, which would send
    // the browser to that real external page - stub it out so the test only
    // verifies the request, without actually navigating away.
    cy.window().then((win) => {
      cy.stub(win.HTMLFormElement.prototype, "submit").as("formSubmit");
    });

    cy.get("[data-cy=avtalegiro-form] button").click({ force: true });

    cy.wait("@draftAvtaleGiro");
    cy.get("@formSubmit").should("have.been.calledOnce");
  });

  it("End-2-End single vipps donation", () => {
    const randomSum = Math.floor(Math.random() * 1000) + 100;
    cy.pickSingleDonation();
    cy.get("[data-cy^=donation-sum-input]").type(randomSum.toString());
    cy.nextWidgetPane();

    cy.pickAnonymous();
    cy.get("[data-cy=payment-method-vipps]").click({ force: true });
    cy.wait(500);

    cy.interceptTrpc("widget.registerDonation", {
      KID: "87397824",
      donorID: 1464,
      hasAnsweredReferral: false,
      paymentProviderUrl: "",
    }).as("registerDonation");

    cy.nextWidgetPane();

    cy.get("[data-cy=vipps-single-button]").within(() => {
      cy.get("button").click({ force: true });
    });
    cy.wait(500);
  });

  it("End-2-End recurring vipps donation", () => {
    const randomSum = Math.floor(Math.random() * 1000) + 100;
    cy.pickRecurringDonation();
    cy.get("[data-cy^=donation-sum-input]").type(randomSum.toString());
    cy.nextWidgetPane();

    cy.pickAnonymous();
    cy.get("[data-cy=payment-method-vipps]").click({ force: true });
    cy.wait(500);

    cy.interceptTrpc("widget.registerDonation", {
      KID: "87397824",
      donorID: 1464,
      hasAnsweredReferral: false,
      paymentProviderUrl: "",
    }).as("registerDonation");

    // Checks the request only: a confirmation URL would send the browser to Vipps
    cy.intercept("POST", trpcUrl("widget.draftVippsAgreement"), (req) => {
      expect(req.body.amount).to.equal(randomSum);
      expect(req.body.KID).to.equal("87397824");
      expect(req.body.sum).to.be.undefined;
      req.reply({
        statusCode: 500,
        body: {
          error: {
            message: "Not in this test",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      });
    }).as("draftVippsAgreement");

    cy.nextWidgetPane();
    cy.wait(500);

    cy.get("[data-cy=vipps-recurring-button]").within(() => {
      cy.get("button").click();
    });
    cy.wait("@draftVippsAgreement");
  });

  it("End-2-End shared donation", () => {
    // Custom distribution now takes direct kroner amounts per organization
    // (rather than percentages), so the total is the sum of the org amounts
    // entered here - the overall sum input above is only used in standard
    // (non-custom) mode.
    cy.pickSingleDonation();
    cy.get("[data-cy^=donation-sum-input]").type("100");
    cy.get("[data-cy=radio-custom-share]").first().click({ force: true });
    // The smart-distribution overall sum is hidden once custom takes over.
    cy.get("[data-cy^=donation-sum-input]").should("not.be.visible");
    cy.get("[data-cy=org-12]").clear();
    cy.get("[data-cy=org-12]").type(500);
    cy.get("[data-cy=org-12]").type("{moveToStart}");
    cy.get("[data-cy=org-12]").type("-"); // negative numbers are blocked
    cy.get("[data-cy=org-12]").should("have.value", "500");
    cy.get("[data-cy=org-11]").type(300);
    cy.nextWidgetPane();

    cy.pickAnonymous();
    cy.get("[data-cy=payment-method-bank]").click({ force: true });

    cy.intercept("POST", trpcUrl("widget.registerDonation"), (req) => {
      // Total is the sum of the entered org amounts (500 + 300), not the
      // standalone sum input entered before switching to custom mode
      expect(req.body.amount).to.eq(800);

      const causeArea = req.body.distributionCauseAreas[0];
      const sumOfShares = causeArea.organizations.reduce(
        (sum, org) => sum + parseFloat(org.percentageShare),
        0,
      );
      // Org percentages must sum to exactly 100 within the cause area
      expect(sumOfShares).to.eq(100);

      req.reply({
        statusCode: 200,
        body: {
          result: {
            data: {
              KID: "87397824",
              donorID: 1464,
              hasAnsweredReferral: false,
              paymentProviderUrl: "",
            },
          },
        },
      });
    }).as("registerDonation");

    cy.interceptTrpc("widget.registerBankPending", true).as("bankPending");

    cy.nextWidgetPane();

    cy.get("[data-cy=kidNumber]").should(($kid) => {
      const kid = $kid.text();
      expect(kid).to.be.length(8);
    });
  });

  it("End-2-End for all input fields", () => {
    const randomSum = Math.floor(Math.random() * 1000) + 100;
    cy.pickSingleDonation();
    cy.get("[data-cy^=donation-sum-input]").type(randomSum.toString());
    cy.nextWidgetPane();

    cy.prevWidgetPane();
    cy.get("[data-cy^=donation-sum-input]").clear();
    cy.get("[data-cy^=donation-sum-input]").type(0);
    cy.nextWidgetPane();
    cy.checkNextIsDisabled();
    cy.get("[data-cy^=donation-sum-input]").type(1);
    cy.nextWidgetPane();

    cy.wait(500);
    cy.get("[data-cy=name-input]").type("Donor Name");
    cy.get("[data-cy=email-input]").type("donor@email.com");
    cy.get("[data-cy=tax-deduction-checkbox]").click();
    cy.get("[data-cy=ssn-input]").type("916741057"); // Check 9 digit organization number
    cy.get("[data-cy=newsletter-checkbox]").click();

    // Exercise clearing/retyping the ssn and email fields
    cy.get("[data-cy=ssn-input]").clear();
    cy.get("[data-cy=ssn-input]").type("10915596784"); // 11 digit valid ssn
    cy.get("[data-cy=email-input]").clear();
    cy.get("[data-cy=email-input]").type("donor@email.com");

    cy.get("[data-cy=payment-method-bank]").click({ force: true });

    cy.interceptTrpc("widget.registerDonation", {
      KID: "87397824",
      donorID: 973,
      hasAnsweredReferral: false,
      paymentProviderUrl: "",
    }).as("registerDonation");

    cy.interceptTrpc("widget.registerBankPending", true).as("bankPending");

    cy.nextWidgetPane();

    cy.get("[data-cy=kidNumber]").should(($kid) => {
      const kid = $kid.text();
      expect(kid).to.be.length(8);
    });

    cy.interceptTrpc("widget.submitReferral", true).as("postReferrals");

    cy.get("[data-cy=referral-button-1]").click();
    cy.get("[data-cy=referral-text-input]").type("Referral text");
  });

  it("End-2-End for existing donor", () => {
    cy.login();

    cy.interceptDonorProfile(mockDonor).as("getDonor");

    cy.fixture("donations")
      .then((donations) => {
        cy.interceptTrpc("minside.donations", donations);
      })
      .as("getDonations");

    cy.fixture("aggregated")
      .then((aggregateddonations) => {
        cy.interceptTrpc("minside.donationsAggregated", aggregateddonations);
      })
      .as("getAggregated");

    cy.fixture("kids_donations")
      .then((kids) => {
        cy.interceptTrpc("minside.distributions", kids);
      })
      .as("getDistribution");

    cy.fixture("referrals").then((referrals) => {
      cy.interceptTrpc("widget.referralTypes", referrals).as("getReferrals");
    });

    cy.fixture("organizations").then((orgs) => {
      cy.interceptTrpc("site.organizations", orgs).as("getOrganizations");
    });

    cy.fixture(`evaluations/evaluations.json`)
      .then((evaluations) => {
        cy.intercept(
          "https://impact.gieffektivt.no/api/evaluations?charity_abbreviation=*&currency=*&language=*&donation_year=*&donation_month=*",
          (req) => {
            const [, abbriv, year, month] = req.url.match(
              /.*abbreviation=(.*)\&currency.*year=(\d{4}).*month=(\d{1,2})/,
            );
            const filename = `${year}-${month}-${abbriv}`;
            if (evaluations[filename]) {
              req.reply(evaluations[filename]);
            } else {
              req.reply({ evaluations: [] });
            }
          },
        ).as("getEvaluations");
      })
      .as("evaluationFixture");

    cy.fixture("grants")
      .then((grants) => {
        cy.intercept(
          "GET",
          "https://impact.gieffektivt.no/api/max_impact_fund_grants?currency=*&language=*&*",
          {
            statusCode: 200,
            body: grants,
          },
        ).as("getGrants");
      })
      .as("grantsFixture");

    cy.wait(500);
    cy.visit({
      url: "/min-side",
      headers: {
        "x-vercel-skip-toolbar": "1",
      },
    });

    cy.wait(
      ["@getDonor", "@getDonations", "@getAggregated", "@getDistribution", "@getCauseAreas"],
      {
        timeout: 30000,
      },
    );

    cy.get("[data-cy=send-donation-button]").click();

    const randomSum = Math.floor(Math.random() * 1000) + 100;
    cy.pickSingleDonation();
    cy.get("[data-cy^=donation-sum-input]").type(randomSum.toString());
    cy.nextWidgetPane();

    cy.get("[data-cy=name-input]").should("have.value", mockDonor.name);
    cy.get("[data-cy=email-input]").should("have.value", mockDonor.email);

    cy.get("[data-cy=payment-method-bank]").click({ force: true });
    cy.wait(500);

    cy.intercept("POST", trpcUrl("widget.registerDonation"), (req) => {
      expect(req.body).to.have.property("donor");
      expect(req.body.donor).to.have.property("email", mockDonor.email);
      expect(req.body.donor).to.have.property("name", mockDonor.name);

      req.reply({
        statusCode: 200,
        body: {
          result: {
            data: {
              KID: "87397824",
              donorID: mockDonor.id,
              hasAnsweredReferral: false,
              paymentProviderUrl: "",
            },
          },
        },
      });
    }).as("registerDonation");

    cy.intercept("POST", trpcUrl("widget.registerBankPending"), (req) => {
      expect(req.body).to.eql({ KID: "87397824", sum: randomSum });

      req.reply({ statusCode: 200, body: { result: { data: true } } });
    }).as("bankPending");

    cy.nextWidgetPane();
  });
});
