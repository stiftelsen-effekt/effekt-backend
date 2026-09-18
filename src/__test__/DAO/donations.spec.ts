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
  });
});
