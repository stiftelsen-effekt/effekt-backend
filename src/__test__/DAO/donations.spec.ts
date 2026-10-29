import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";
import { RequestLocale } from "../../middleware/locale";

describe("DAO donations", () => {
  describe("getAll", () => {
    const sort = { id: "timestamp", desc: true };

    /**
     * getAll runs two queries side by side: the page (first call, with LIMIT/OFFSET params)
     * and the totals over every matching donation (second call).
     */
    const donationRow = (overrides: { sum_confirmed: number }) => ({
      ID: 1,
      full_name: "Test Donor",
      payment_name: "VIPPS",
      transaction_cost: 2,
      KID_fordeling: "123",
      timestamp_confirmed: new Date("2024-01-01"),
      tax_unit_type: "person",
      ...overrides,
    });
    const totalsRow = (row: { full_count: number; full_sum: number; full_avg: number }) => row;

    const stubPageAndTotals = (
      row: ReturnType<typeof donationRow>,
      totals: ReturnType<typeof totalsRow>,
    ) => {
      const queryStub = sinon.stub(DAO, "query");
      queryStub.onFirstCall().resolves([[row], []]);
      queryStub.onSecondCall().resolves([[totals], []]);
      return queryStub;
    };

    const calls = (queryStub: sinon.SinonStub) => ({
      pageSql: queryStub.firstCall.args[0] as string,
      pageParams: queryStub.firstCall.args[1] as unknown[],
      totalsSql: queryStub.secondCall.args[0] as string,
    });

    afterEach(() => {
      sinon.restore();
    });

    it("uses the full donation amount when no organization filter is set", async () => {
      const queryStub = stubPageAndTotals(
        donationRow({ sum_confirmed: 1000 }),
        totalsRow({ full_count: 1, full_sum: 1000, full_avg: 1000 }),
      );

      const result = await DAO.donations.getAll(sort, 0, 10, {}, RequestLocale.NO);

      expect(queryStub.calledTwice).to.be.true;
      const { pageSql, pageParams, totalsSql } = calls(queryStub);
      expect(pageSql).to.contain("Donations.sum_confirmed as sum_confirmed");
      expect(pageSql).to.match(
        /ORDER BY timestamp_confirmed DESC, Donations\.ID DESC\s+LIMIT \? OFFSET \?/,
      );
      expect(pageParams).to.deep.equal([10, 0]);
      expect(totalsSql).to.contain("SUM(Donations.sum_confirmed) as full_sum");
      expect(totalsSql).to.not.contain("LIMIT");
      for (const sql of [pageSql, totalsSql]) {
        expect(sql).to.not.contain("selected_org_shares");
        expect(sql).to.not.match(/ROUND\(Donations\.sum_confirmed \* selected_org_shares/);
      }
      expect(result.statistics).to.deep.equal({
        numDonations: 1,
        sumDonations: 1000,
        avgDonation: 1000,
      });
      expect(result.rows[0].sum).to.equal(1000);
    });

    it("prorates table and stats amounts by selected organization shares", async () => {
      const queryStub = stubPageAndTotals(
        donationRow({ sum_confirmed: 400 }),
        totalsRow({ full_count: 1, full_sum: 400, full_avg: 400 }),
      );

      const result = await DAO.donations.getAll(
        sort,
        0,
        10,
        { organizationIDs: [12, 17] },
        RequestLocale.NO,
      );

      expect(queryStub.calledTwice).to.be.true;
      const { pageSql, pageParams, totalsSql } = calls(queryStub);
      const prorated = "ROUND(Donations.sum_confirmed * selected_org_shares.selected_share, 2)";

      // Both the table and the totals use the amount to the selected organizations
      expect(pageSql).to.contain(`${prorated} as sum_confirmed`);
      expect(totalsSql).to.contain(`SUM(${prorated}) as full_sum`);
      expect(totalsSql).to.contain(`AVG(${prorated}) as full_avg`);
      expect(pageParams).to.deep.equal([10, 0]);
      for (const sql of [pageSql, totalsSql]) {
        expect(sql).to.contain("selected_org_shares AS");
        expect(sql).to.contain("INNER JOIN selected_org_shares");
        expect(sql).to.contain("Distribution_cause_areas.Percentage_share / 100");
        expect(sql).to.contain("Distribution_cause_area_organizations.Percentage_share / 100");
        expect(sql).to.contain("Organization_ID IN (12,17)");
        expect(sql).to.not.contain("SELECT DISTINCT");
        expect(sql).to.not.contain("LEFT JOIN Distribution_cause_areas");
      }

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
      const queryStub = stubPageAndTotals(
        donationRow({ sum_confirmed: 1000 }),
        totalsRow({ full_count: 1, full_sum: 1000, full_avg: 1000 }),
      );

      await DAO.donations.getAll(sort, 0, 10, { dataOwnerIDs: [1, 3] }, RequestLocale.NO);

      expect(queryStub.calledTwice).to.be.true;
      const { pageSql, totalsSql } = calls(queryStub);
      expect(pageSql).to.contain("Donations.Meta_owner_ID IN (1,3)");
      expect(totalsSql).to.contain("Donations.Meta_owner_ID IN (1,3)");
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

  describe("queries rewritten for the multiple cause area schema", () => {
    afterEach(() => {
      sinon.restore();
    });

    const expectCurrentSchema = (sql: string) => {
      expect(sql).to.not.match(/Combining_table|JOIN Distribution\b|CALL/i);
      expect(sql).to.contain("Distribution_cause_areas");
      expect(sql).to.contain("Distribution_cause_area_organizations");
    };

    it("getAggregateByTime sums each organization's share of the cause area share", async () => {
      const rows = [
        { id: 1, orgName: "Org", chartColor: "chart-3", sum: "12.50" },
        { id: 2, orgName: "Other org", chartColor: "teal", sum: "1.00" },
      ];
      const queryStub = sinon.stub(DAO, "query").resolves([rows, []]);
      const from = new Date("2024-01-01");
      const to = new Date("2024-12-31");

      // Stored chart colours pass through; values outside the palette read as null.
      expect(await DAO.donations.getAggregateByTime(from, to)).to.deep.equal([
        rows[0],
        { ...rows[1], chartColor: null },
      ]);

      const [sql, params] = queryStub.firstCall.args;
      expectCurrentSchema(sql);
      expect(sql).to.match(/GROUP BY Organizations\.ID/);
      expect(params).to.deep.equal([from, to]);
    });

    it("getFromRange groups organization rows per donation, sorted by time", async () => {
      const row = (id: number, time: string, org: number, share: string, amount: string) => ({
        Donation_ID: id,
        timestamp_confirmed: new Date(time),
        Donor_ID: 7,
        transaction_cost: "2.00",
        donor_name: "Donor",
        sum_confirmed: "100.00",
        payment_name: "Bank",
        Org_ID: org,
        org_name: `Org ${org}`,
        percentage_share: share,
        actual_share: amount,
      });
      const queryStub = sinon
        .stub(DAO, "query")
        .resolves([
          [
            row(2, "2024-01-02", 1, "60.000000000000", "60.00"),
            row(2, "2024-01-02", 2, "40.000000000000", "40.00"),
            row(1, "2024-01-01", 1, "100.000000000000", "100.00"),
          ],
          [],
        ]);

      const result = await DAO.donations.getFromRange(
        new Date("2024-01-01"),
        new Date("2024-01-02"),
        [4],
      );

      expectCurrentSchema(queryStub.firstCall.args[0]);
      expect(queryStub.firstCall.args[0]).to.contain("Donations.Payment_ID IN (?)");
      expect(result.map((d) => d.ID)).to.deep.equal([1, 2]);
      expect(result[1]).to.deep.include({ sum: "100.00", transactionCost: "2.00", donorID: 7 });
      expect(result[1].split).to.deep.equal([
        { id: 1, name: "Org 1", percentage: "60.000000000000", amount: "60.00" },
        { id: 2, name: "Org 2", percentage: "40.000000000000", amount: "40.00" },
      ]);
    });

    it("externalRefExists checks every payment method", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([[{ ID: 1 }], []]);
      expect(await DAO.donations.externalRefExists("abc")).to.be.true;
      expect(queryStub.firstCall.args[0]).to.not.contain("Payment_ID");
      expect(queryStub.firstCall.args[1]).to.deep.equal(["abc"]);
    });
  });
});
