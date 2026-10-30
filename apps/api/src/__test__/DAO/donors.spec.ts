import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";
import { RequestLocale } from "../../middleware/locale";

describe("DAO donors", () => {
  describe("getAll", () => {
    const sort = { id: "id", desc: true };

    afterEach(() => {
      sinon.restore();
    });

    it("uses the full donation amount when no organization filter is set", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([
        [
          {
            ID: 1,
            full_name: "Test Donor",
            email: "test@example.com",
            date_registered: new Date("2024-01-01"),
            newsletter: 1,
            last_donation_date: new Date("2024-06-01"),
            donations_count: 2,
            donations_sum: 1000,
            total_donors_count: 1,
            total_donations_sum: 1000,
            total_donations_count: 2,
          },
        ],
        [],
      ]);

      const result = await DAO.donors.getAll(sort, 0, 10, null, RequestLocale.NO);

      expect(queryStub.calledOnce).to.be.true;
      const sql = queryStub.firstCall.args[0] as string;
      expect(sql).to.contain("COALESCE(SUM(Dons.sum_confirmed), 0) as donations_sum");
      expect(sql).to.contain("LEFT JOIN Donations Dons");
      expect(sql).to.contain("LEFT JOIN DonorAggregates");
      expect(sql).to.not.contain("selected_org_shares");
      expect(result.rows[0].donationsSum).to.equal(1000);
      expect(result.statistics).to.deep.equal({
        totalDonors: 1,
        totalDonationSum: 1000,
        totalDonationCount: 2,
      });
    });

    it("prorates donor sums and stats by selected organization shares", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([
        [
          {
            ID: 1,
            full_name: "Test Donor",
            email: "test@example.com",
            date_registered: new Date("2024-01-01"),
            newsletter: 0,
            last_donation_date: new Date("2024-06-01"),
            donations_count: 1,
            donations_sum: 400,
            total_donors_count: 1,
            total_donations_sum: 400,
            total_donations_count: 1,
          },
        ],
        [],
      ]);

      const result = await DAO.donors.getAll(
        sort,
        0,
        10,
        { donorId: null, recipientOrgIDs: [12, 17] },
        RequestLocale.NO,
      );

      expect(queryStub.calledOnce).to.be.true;
      const sql = queryStub.firstCall.args[0] as string;

      expect(sql).to.contain("selected_org_shares AS");
      expect(sql).to.contain("INNER JOIN selected_org_shares");
      expect(sql).to.contain("INNER JOIN DonorAggregates");
      expect(sql).to.contain(
        "COALESCE(SUM(ROUND(Dons.sum_confirmed * selected_org_shares.selected_share, 2)), 0)",
      );
      expect(sql).to.contain("Distribution_cause_areas.Percentage_share / 100");
      expect(sql).to.contain("Distribution_cause_area_organizations.Percentage_share / 100");
      expect(sql).to.contain("Organization_ID IN (12,17)");
      expect(sql).to.not.contain("EXISTS");

      expect(result.rows[0].donationsSum).to.equal(400);
      expect(result.statistics).to.deep.equal({
        totalDonors: 1,
        totalDonationSum: 400,
        totalDonationCount: 1,
      });
    });

    it("returns empty statistics without querying when no organizations are selected", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const result = await DAO.donors.getAll(
        sort,
        0,
        10,
        { donorId: null, recipientOrgIDs: [] },
        RequestLocale.NO,
      );

      expect(queryStub.called).to.be.false;
      expect(result).to.deep.equal({
        rows: [],
        statistics: {
          totalDonors: 0,
          totalDonationCount: 0,
          totalDonationSum: 0,
        },
        pages: 0,
      });
    });
  });
});
