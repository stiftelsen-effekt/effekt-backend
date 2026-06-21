import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";

describe("DAO Distributions", () => {
  describe("getAll", () => {
    const mockActiveOrgs = [{ abbriv: "AMF" }, { abbriv: "GW" }];

    const mockResultRows = [
      {
        KID: "123456789",
        full_name: "Test Testesen",
        email: "testæøå@test.com",
        donation_sum: 100,
        donation_count: 2,
        total_rows: 2,
        AMF: "50.000000",
        GW: "50.000000",
      },
      {
        KID: "987654321",
        full_name: "Test Testesen",
        email: "testæøå@test.com",
        donation_sum: 200,
        donation_count: 1,
        total_rows: 2,
        AMF: "100.000000",
        GW: "0.000000",
      },
    ];

    it("Gets all distributions with no filter", async () => {
      const queryStub = sinon.stub(DAO, "query");

      // First call: active orgs query; second call: main query
      queryStub.onFirstCall().resolves([mockActiveOrgs, []]);
      queryStub.onSecondCall().resolves([mockResultRows, []]);

      const result = await DAO.distributions.getAll(0, 10, { id: "KID" }, null);

      expect(queryStub.calledTwice).to.be.true;
      expect(result.rows).to.have.length(2);
      expect(result.rows[0].KID).to.equal("123456789");
      expect(result.pages).to.equal(1);
      // No donor/KID filter in the FilteredDistributions CTE
      expect(queryStub.secondCall.args[0]).to.not.contain("full_name LIKE");
      expect(queryStub.secondCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.secondCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with filter", async () => {
      const queryStub = sinon.stub(DAO, "query");

      queryStub.onFirstCall().resolves([mockActiveOrgs, []]);
      queryStub.onSecondCall().resolves([mockResultRows, []]);

      const result = await DAO.distributions.getAll(
        0,
        10,
        { id: "KID" },
        { donor: "Test Testesen" },
      );

      expect(queryStub.calledTwice).to.be.true;
      expect(result.rows).to.have.length(2);
      expect(queryStub.secondCall.args[0]).to.contain("WHERE");
      expect(queryStub.secondCall.args[0]).to.contain("Test Testesen");
      expect(queryStub.secondCall.args[0]).to.contain("LIKE");
      expect(queryStub.secondCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.secondCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with filter and order", async () => {
      const queryStub = sinon.stub(DAO, "query");

      queryStub.onFirstCall().resolves([mockActiveOrgs, []]);
      queryStub.onSecondCall().resolves([mockResultRows, []]);

      const result = await DAO.distributions.getAll(
        0,
        10,
        { id: "sum", desc: true },
        { donor: "Test Testesen" },
      );

      expect(queryStub.calledTwice).to.be.true;
      expect(result.rows).to.have.length(2);
      expect(queryStub.secondCall.args[0]).to.contain("WHERE");
      expect(queryStub.secondCall.args[0]).to.contain("Test Testesen");
      expect(queryStub.secondCall.args[0]).to.contain("LIKE");
      expect(queryStub.secondCall.args[0]).to.contain("ORDER BY donation_sum DESC");
      expect(queryStub.secondCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.secondCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with correct pages counter when there are more rows than the limit", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const threeRowResult = [
        { ...mockResultRows[0], total_rows: 3 },
        { ...mockResultRows[1], total_rows: 3 },
        { ...mockResultRows[0], KID: "111111111", total_rows: 3 },
      ];

      queryStub.onFirstCall().resolves([mockActiveOrgs, []]);
      queryStub.onSecondCall().resolves([threeRowResult, []]);

      const result = await DAO.distributions.getAll(0, 1, { id: "KID" }, null);

      expect(queryStub.calledTwice).to.be.true;
      expect(result.pages).to.equal(3);
      expect(queryStub.secondCall.args[0]).to.not.contain("full_name LIKE");
      expect(queryStub.secondCall.args[0]).to.contain("LIMIT 1");
      expect(queryStub.secondCall.args[0]).to.contain("OFFSET 0");
    });

    it("Throws error for invalid sort column", async () => {
      try {
        await DAO.distributions.getAll(0, 10, { id: "INVALID" }, null);
        expect.fail("Should have thrown");
      } catch (ex) {
        expect(ex.message).to.contain("Invalid sort column");
      }
    });

    it("Returns empty result when no rows match", async () => {
      const queryStub = sinon.stub(DAO, "query");

      queryStub.onFirstCall().resolves([mockActiveOrgs, []]);
      queryStub.onSecondCall().resolves([[], []]);

      const result = await DAO.distributions.getAll(0, 10, { id: "KID" }, null);

      expect(result.rows).to.have.length(0);
      expect(result.pages).to.equal(0);
    });

    afterEach(() => {
      sinon.restore();
    });
  });

  describe("getAllByDonor", () => {
    it("Gets all distributions for a donor with a given ID", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 9,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 3,
          Percentage_share: "100.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 5,
          Organization_ID: 20,
          Organization_percentage_share: "100.000000000000",
          Cause_area_percentage_share: "77.000000000000",
        },
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 10,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 6,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "23.000000000000",
        },
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 11,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 6,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "23.000000000000",
        },
        {
          KID: "000001557651286",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-10 21:48:20",
          last_updated: "2023-05-10 21:48:20",
          ID: 1,
          Distribution_KID: "000001557651286",
          Cause_area_ID: 3,
          Percentage_share: "61.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 1,
          Organization_ID: 21,
          Organization_percentage_share: "61.000000000000",
          Cause_area_percentage_share: "84.000000000000",
        },
        {
          KID: "000001557651286",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-10 21:48:20",
          last_updated: "2023-05-10 21:48:20",
          ID: 2,
          Distribution_KID: "000001557651286",
          Cause_area_ID: 3,
          Percentage_share: "29.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 1,
          Organization_ID: 23,
          Organization_percentage_share: "29.000000000000",
          Cause_area_percentage_share: "84.000000000000",
        },
        {
          KID: "000001557651286",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-10 21:48:20",
          last_updated: "2023-05-10 21:48:20",
          ID: 3,
          Distribution_KID: "000001557651286",
          Cause_area_ID: 3,
          Percentage_share: "10.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 1,
          Organization_ID: 22,
          Organization_percentage_share: "10.000000000000",
          Cause_area_percentage_share: "84.000000000000",
        },
        {
          KID: "000001557651286",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-10 21:48:20",
          last_updated: "2023-05-10 21:48:20",
          ID: 4,
          Distribution_KID: "000001557651286",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 2,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "16.000000000000",
        },
        {
          KID: "000001557651286",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-10 21:48:20",
          last_updated: "2023-05-10 21:48:20",
          ID: 5,
          Distribution_KID: "000001557651286",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 2,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "16.000000000000",
        },
        {
          KID: "000001793339258",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-06 17:47:55",
          last_updated: "2023-02-06 17:47:55",
          ID: 15,
          Distribution_KID: "000001793339258",
          Cause_area_ID: 2,
          Percentage_share: "100.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 9,
          Organization_ID: 18,
          Organization_percentage_share: "100.000000000000",
          Cause_area_percentage_share: "24.000000000000",
        },
        {
          KID: "000001793339258",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-06 17:47:55",
          last_updated: "2023-02-06 17:47:55",
          ID: 16,
          Distribution_KID: "000001793339258",
          Cause_area_ID: 3,
          Percentage_share: "54.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 10,
          Organization_ID: 22,
          Organization_percentage_share: "54.000000000000",
          Cause_area_percentage_share: "76.000000000000",
        },
        {
          KID: "000001793339258",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-06 17:47:55",
          last_updated: "2023-02-06 17:47:55",
          ID: 17,
          Distribution_KID: "000001793339258",
          Cause_area_ID: 3,
          Percentage_share: "46.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 10,
          Organization_ID: 20,
          Organization_percentage_share: "46.000000000000",
          Cause_area_percentage_share: "76.000000000000",
        },
        {
          KID: "000001794945871",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-18 06:24:14",
          last_updated: "2023-02-18 06:24:14",
          ID: 6,
          Distribution_KID: "000001794945871",
          Cause_area_ID: 3,
          Percentage_share: "100.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 3,
          Organization_ID: 22,
          Organization_percentage_share: "100.000000000000",
          Cause_area_percentage_share: "64.000000000000",
        },
        {
          KID: "000001794945871",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-18 06:24:14",
          last_updated: "2023-02-18 06:24:14",
          ID: 7,
          Distribution_KID: "000001794945871",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 4,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "36.000000000000",
        },
        {
          KID: "000001794945871",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-18 06:24:14",
          last_updated: "2023-02-18 06:24:14",
          ID: 8,
          Distribution_KID: "000001794945871",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 4,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "36.000000000000",
        },
        {
          KID: "000001798639637",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-03-04 02:32:13",
          last_updated: "2023-03-04 02:32:13",
          ID: 12,
          Distribution_KID: "000001798639637",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 7,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "100.000000000000",
        },
        {
          KID: "000001798639637",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-03-04 02:32:13",
          last_updated: "2023-03-04 02:32:13",
          ID: 13,
          Distribution_KID: "000001798639637",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 7,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "100.000000000000",
        },
        {
          KID: "000001798639637",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-03-04 02:32:13",
          last_updated: "2023-03-04 02:32:13",
          ID: 14,
          Distribution_KID: "000001798639637",
          Cause_area_ID: 3,
          Percentage_share: "100.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 8,
          Organization_ID: 20,
          Organization_percentage_share: "100.000000000000",
          Cause_area_percentage_share: "0.000000000000",
        },
        {
          KID: "000001881542474",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-19 11:42:09",
          last_updated: "2023-05-19 11:42:09",
          ID: 18,
          Distribution_KID: "000001881542474",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 11,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "51.000000000000",
        },
        {
          KID: "000001881542474",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-19 11:42:09",
          last_updated: "2023-05-19 11:42:09",
          ID: 19,
          Distribution_KID: "000001881542474",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 11,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "51.000000000000",
        },
        {
          KID: "000001881542474",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-19 11:42:09",
          last_updated: "2023-05-19 11:42:09",
          ID: 20,
          Distribution_KID: "000001881542474",
          Cause_area_ID: 3,
          Percentage_share: "61.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 12,
          Organization_ID: 20,
          Organization_percentage_share: "61.000000000000",
          Cause_area_percentage_share: "49.000000000000",
        },
        {
          KID: "000001881542474",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-19 11:42:09",
          last_updated: "2023-05-19 11:42:09",
          ID: 21,
          Distribution_KID: "000001881542474",
          Cause_area_ID: 3,
          Percentage_share: "32.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 12,
          Organization_ID: 21,
          Organization_percentage_share: "32.000000000000",
          Cause_area_percentage_share: "49.000000000000",
        },
        {
          KID: "000001881542474",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-05-19 11:42:09",
          last_updated: "2023-05-19 11:42:09",
          ID: 22,
          Distribution_KID: "000001881542474",
          Cause_area_ID: 3,
          Percentage_share: "7.000000000000",
          Standard_split: 0,
          Distribution_cause_area_ID: 12,
          Organization_ID: 23,
          Organization_percentage_share: "7.000000000000",
          Cause_area_percentage_share: "49.000000000000",
        },
      ];

      queryStub.resolves([mockQueryResponse, []]);

      const result = await DAO.distributions.getAllByDonor(1);

      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("Donor_ID = ?");
      expect(queryStub.firstCall.args[1]).to.deep.equal([1]);

      expect(result.distributions.length).to.equal(6);

      for (const distribution of result.distributions) {
        expect(distribution.donorId).to.equal(1);

        // Expect cause area percentage shares to add up to 100
        expect(
          distribution.causeAreas.reduce((acc, curr) => acc + parseFloat(curr.percentageShare), 0),
        ).to.equal(100);

        for (const causeArea of distribution.causeAreas) {
          // Expect organization percentage shares to add up to 100
          expect(
            causeArea.organizations.reduce(
              (acc, curr) => acc + parseFloat(curr.percentageShare),
              0,
            ),
          ).to.equal(100);
        }
      }
    });

    afterEach(() => {
      sinon.restore();
    });
  });

  describe("getByDonorId", () => {
    it("Gets a distribution for a donor with a given ID", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "000001333993788",
          full_name: "Helga Larsen",
          email: "helga@larsen.no",
          sum: 1300,
          count: 3,
        },
        {
          KID: "13903788",
          full_name: "Helga Larsen",
          email: "helga@larsen.no",
          sum: 40000,
          count: 1,
        },
      ];

      queryStub.resolves([mockQueryResponse, []]);

      const result = await DAO.distributions.getByDonorId(1);

      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("Donor_ID = ?");
      expect(queryStub.firstCall.args[1]).to.deep.equal([1]);

      expect(result).to.deep.equal(mockQueryResponse);
    });

    afterEach(() => {
      sinon.restore();
    });
  });

  describe("getSplitByKID", () => {
    it("Gets a distribution split for a KID", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 9,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 3,
          Percentage_share: "100.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 5,
          Organization_ID: 20,
          Organization_percentage_share: "100.000000000000",
          Cause_area_percentage_share: "77.000000000000",
        },
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 10,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 6,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "23.000000000000",
        },
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 11,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 6,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "23.000000000000",
        },
      ];

      queryStub.resolves([mockQueryResponse, []]);

      const result = await DAO.distributions.getSplitByKID("000001333993788");

      expect(queryStub.calledOnce).to.be.true;
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("KID = ?");
      expect(queryStub.firstCall.args[1]).to.deep.equal(["000001333993788"]);
      expect(result.kid).to.equal("000001333993788");
      expect(result.causeAreas.length).to.equal(2);
      expect(result.causeAreas[0].percentageShare).to.equal("77.000000000000");
      expect(result.causeAreas[0].organizations.length).to.equal(1);
      expect(result.causeAreas[0].organizations[0].percentageShare).to.equal("100.000000000000");
      expect(result.causeAreas[1].percentageShare).to.equal("23.000000000000");
      expect(result.causeAreas[1].organizations.length).to.equal(2);
      expect(result.causeAreas[1].organizations[0].percentageShare).to.equal("50.000000000000");
      expect(result.causeAreas[1].organizations[1].percentageShare).to.equal("50.000000000000");
    });

    it("Throws error if DB query returns multiple distributions", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "000001333993788",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 9,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 3,
          Percentage_share: "100.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 5,
          Organization_ID: 20,
          Organization_percentage_share: "100.000000000000",
          Cause_area_percentage_share: "100.000000000000",
        },
        {
          KID: "000001333993789",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 10,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 6,
          Organization_ID: 17,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "100.000000000000",
        },
        {
          KID: "000001333993789",
          Donor_ID: 1,
          Tax_unit_ID: 1,
          Meta_owner_ID: 3,
          Replaced_old_organizations: 0,
          inserted: "2023-02-28 12:22:44",
          last_updated: "2023-02-28 12:22:44",
          ID: 11,
          Distribution_KID: "000001333993788",
          Cause_area_ID: 2,
          Percentage_share: "50.000000000000",
          Standard_split: 1,
          Distribution_cause_area_ID: 6,
          Organization_ID: 18,
          Organization_percentage_share: "50.000000000000",
          Cause_area_percentage_share: "100.000000000000",
        },
      ];

      queryStub.resolves([mockQueryResponse, []]);

      try {
        const result = await DAO.distributions.getSplitByKID("000001333993788");
        throw new Error("Promise did not reject as expected");
      } catch (ex) {
        expect(ex.message).to.contain("multiple distributions");
      }
    });

    afterEach(() => {
      sinon.restore();
    });
  });
});
