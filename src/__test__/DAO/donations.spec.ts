import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";
import { RequestLocale } from "../../middleware/locale";

describe("DAO donations", () => {
  describe("getAll", () => {
    const sort = { id: "timestamp", desc: true };

    afterEach(() => {
      sinon.restore();
    });

    it("uses the full donation amount when no organization filter is set", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([
        [
          {
            ID: 1,
            full_name: "Test Donor",
            payment_name: "VIPPS",
            sum_confirmed: 1000,
            transaction_cost: 2,
            KID_fordeling: "123",
            timestamp_confirmed: new Date("2024-01-01"),
            tax_unit_type: "person",
            full_count: 1,
            full_sum: 1000,
            full_avg: 1000,
          },
        ],
        [],
      ]);

      const result = await DAO.donations.getAll(sort, 0, 10, {}, RequestLocale.NO);

      expect(queryStub.calledOnce).to.be.true;
      const sql = queryStub.firstCall.args[0] as string;
      expect(sql).to.contain("Donations.sum_confirmed as sum_confirmed");
      expect(sql).to.not.contain("selected_org_shares");
      expect(sql).to.not.match(/ROUND\(Donations\.sum_confirmed \* selected_org_shares/);
      expect(result.statistics).to.deep.equal({
        numDonations: 1,
        sumDonations: 1000,
        avgDonation: 1000,
      });
      expect(result.rows[0].sum).to.equal(1000);
    });

    it("prorates table and stats amounts by selected organization shares", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([
        [
          {
            ID: 1,
            full_name: "Test Donor",
            payment_name: "VIPPS",
            sum_confirmed: 400,
            transaction_cost: 2,
            KID_fordeling: "123",
            timestamp_confirmed: new Date("2024-01-01"),
            tax_unit_type: "person",
            full_count: 1,
            full_sum: 400,
            full_avg: 400,
          },
        ],
        [],
      ]);

      const result = await DAO.donations.getAll(
        sort,
        0,
        10,
        { organizationIDs: [12, 17] },
        RequestLocale.NO,
      );

      expect(queryStub.calledOnce).to.be.true;
      const sql = queryStub.firstCall.args[0] as string;

      expect(sql).to.contain("selected_org_shares AS");
      expect(sql).to.contain("INNER JOIN selected_org_shares");
      expect(sql).to.contain(
        "ROUND(Donations.sum_confirmed * selected_org_shares.selected_share, 2)",
      );
      expect(sql).to.contain("Distribution_cause_areas.Percentage_share / 100");
      expect(sql).to.contain("Distribution_cause_area_organizations.Percentage_share / 100");
      expect(sql).to.contain("Organization_ID IN (12,17)");
      expect(sql).to.not.contain("SELECT DISTINCT");
      expect(sql).to.not.contain("LEFT JOIN Distribution_cause_areas");

      expect(result.rows[0].sum).to.equal(400);
      expect(result.statistics).to.deep.equal({
        numDonations: 1,
        sumDonations: 400,
        avgDonation: 400,
      });
    });

    it("returns empty statistics without querying when no organizations are selected", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const result = await DAO.donations.getAll(
        sort,
        0,
        10,
        { organizationIDs: [] },
        RequestLocale.NO,
      );

      expect(queryStub.called).to.be.false;
      expect(result).to.deep.equal({
        rows: [],
        statistics: {
          numDonations: 0,
          sumDonations: 0,
          avgDonation: 0,
        },
        pages: 0,
      });
    });

    it("filters on the donation data owner when data owners are selected", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([[], []]);

      await DAO.donations.getAll(sort, 0, 10, { dataOwnerIDs: [1, 3] }, RequestLocale.NO);

      expect(queryStub.calledOnce).to.be.true;
      const sql = queryStub.firstCall.args[0] as string;
      expect(sql).to.contain("Donations.Meta_owner_ID IN (1,3)");
    });

    it("returns empty statistics without querying when no data owners are selected", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const result = await DAO.donations.getAll(
        sort,
        0,
        10,
        { dataOwnerIDs: [] },
        RequestLocale.NO,
      );

      expect(queryStub.called).to.be.false;
      expect(result).to.deep.equal({
        rows: [],
        statistics: {
          numDonations: 0,
          sumDonations: 0,
          avgDonation: 0,
        },
        pages: 0,
      });
    });
  });

  describe("getEAFundsDonations", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("reads EA Norge (owner 2) donations from Donations with the tax unit from the distribution", async () => {
      const timestamp = new Date("2024-05-01");
      const queryStub = sinon.stub(DAO, "query").resolves([
        [
          {
            ID: 11,
            Donor_ID: 237,
            Tax_unit_ID: 10,
            sum_confirmed: "2000.00",
            timestamp_confirmed: timestamp,
            PaymentExternal_ID: "EAN.1",
          },
          {
            ID: 12,
            Donor_ID: 237,
            Tax_unit_ID: null,
            sum_confirmed: "500.00",
            timestamp_confirmed: timestamp,
            PaymentExternal_ID: "EAN.2",
          },
        ],
        [],
      ]);

      const result = await DAO.donations.getEAFundsDonations(237);

      expect(queryStub.calledOnce).to.be.true;
      const [sql, params] = queryStub.firstCall.args as unknown as [string, unknown[]];
      expect(sql).to.not.contain("Funds_donations");
      expect(sql).to.contain("FROM Donations");
      expect(sql).to.contain("Distributions.Tax_unit_ID");
      expect(sql).to.contain("Donations.Meta_owner_ID = ?");
      expect(params).to.deep.equal([237, 2]);
      expect(result).to.deep.equal([
        {
          id: 11,
          donorId: 237,
          taxUnitId: 10,
          sum: 2000,
          timestamp,
          paymentExternalId: "EAN.1",
        },
        {
          id: 12,
          donorId: 237,
          taxUnitId: null,
          sum: 500,
          timestamp,
          paymentExternalId: "EAN.2",
        },
      ]);
    });
  });
});
