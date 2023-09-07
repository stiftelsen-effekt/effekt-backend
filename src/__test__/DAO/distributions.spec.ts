import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";

describe("DAO Distributions", () => {
  describe("getAll", () => {
    it("Gets all distributions with no filter", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "123456789",
          sum: 100,
          count: 2,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 2,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(0, 10, { id: "ID" }, null);

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 1,
      });
      expect(queryStub.firstCall.args[0]).to.not.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with filter", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "123456789",
          sum: 100,
          count: 2,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 2,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(
        0,
        10,
        { id: "ID" },
        { donor: "Test Testesen" },
      );

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 1,
      });
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("Test Testesen");
      expect(queryStub.firstCall.args[0]).to.contain("LIKE");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with filter and order", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "123456789",
          sum: 100,
          count: 2,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 2,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(
        0,
        10,
        { id: "sum", desc: true },
        { donor: "Test Testesen" },
      );

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 1,
      });
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("Test Testesen");
      expect(queryStub.firstCall.args[0]).to.contain("LIKE");
      expect(queryStub.firstCall.args[0]).to.contain("ORDER BY sum DESC");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with correct pages counter when there are more rows than the limit", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Glor Gorgesen Testesen",
          email: "asd@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 3,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(0, 1, { id: "ID" }, null);

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 3,
      });
      expect(queryStub.firstCall.args[0]).to.not.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 1");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
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
});
