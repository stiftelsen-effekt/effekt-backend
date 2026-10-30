import { describe, it, beforeEach, afterEach } from "vitest";
import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";
import { Distribution, DistributionInput } from "../../schemas/types";

describe("DAO avtalegiroagreements", () => {
  describe("replaceDistribution", () => {
    const originalDistribution: Distribution = {
      kid: "123456789012345",
      donorId: 1,
      taxUnitId: 19,
      causeAreas: [
        {
          id: 1,
          standardSplit: false,
          percentageShare: "90",
          organizations: [
            {
              id: 1,
              percentageShare: "90",
            },
            {
              id: 2,
              percentageShare: "10",
            },
          ],
        },
        {
          id: 2,
          standardSplit: true,
          percentageShare: "10",
          organizations: [
            {
              id: 4,
              percentageShare: "50",
            },
            {
              id: 5,
              percentageShare: "50",
            },
          ],
        },
      ],
    };

    const newDistributionInput: DistributionInput = {
      donorId: 1,
      taxUnitId: 19,
      causeAreas: [
        {
          id: 1,
          standardSplit: false,
          percentageShare: "90.101",
          organizations: [
            {
              id: 1,
              percentageShare: "90",
            },
            {
              id: 2,
              percentageShare: "10",
            },
          ],
        },
        {
          id: 2,
          standardSplit: false,
          percentageShare: "9.899",
          organizations: [
            {
              id: 4,
              percentageShare: "90",
            },
            {
              id: 5,
              percentageShare: "10",
            },
          ],
        },
      ],
    };

    const newKid = "923456789012345";

    let metaStub;
    let queryStub;
    let startTransactionStub;
    let commitTransactionStub;
    let rollbackTransactionStub;
    let distributionAddStub;
    beforeEach(() => {
      queryStub = sinon.stub(DAO, "query");
      metaStub = sinon.stub(DAO.meta, "getDefaultOwnerID");

      // Create a fake mysql connection using sinon
      const connection = {
        query: queryStub,
      } as any;

      startTransactionStub = sinon.stub(DAO, "startTransaction").resolves(connection);
      commitTransactionStub = sinon.stub(DAO, "commitTransaction");
      rollbackTransactionStub = sinon.stub(DAO, "rollbackTransaction");
      distributionAddStub = sinon.stub(DAO.distributions, "add");
    });

    it("Should call get default owner ID if none is provided", async () => {
      await DAO.avtalegiroagreements.replaceDistribution(
        originalDistribution,
        newKid,
        newDistributionInput,
      );

      expect(metaStub.calledOnce).to.be.true;
    });

    it("Should not call get default owner ID if one is provided", async () => {
      await DAO.avtalegiroagreements.replaceDistribution(
        originalDistribution,
        newKid,
        newDistributionInput,
        1,
      );

      expect(metaStub.called).to.be.false;
    });

    it("Should abort and rollback if updating KID fails", async () => {
      queryStub.onFirstCall().rejects();

      try {
        await DAO.avtalegiroagreements.replaceDistribution(
          originalDistribution,
          newKid,
          newDistributionInput,
        );
      } catch (ex) {
        expect(ex).to.not.be.undefined;
        expect(startTransactionStub.calledOnce).to.be.true;
        expect(commitTransactionStub.called).to.be.false;
        expect(rollbackTransactionStub.calledOnce).to.be.true;
      }
    });

    it("Should abort and rollback if updating donations fails", async () => {
      queryStub.onSecondCall().rejects();

      try {
        await DAO.avtalegiroagreements.replaceDistribution(
          originalDistribution,
          newKid,
          newDistributionInput,
        );
      } catch (ex) {
        expect(ex).to.not.be.undefined;
        expect(startTransactionStub.calledOnce).to.be.true;
        expect(commitTransactionStub.called).to.be.false;
        expect(rollbackTransactionStub.calledOnce).to.be.true;
      }
    });

    it("Should abort and rollback if adding new distribution fails", async () => {
      distributionAddStub.rejects();

      try {
        await DAO.avtalegiroagreements.replaceDistribution(
          originalDistribution,
          newKid,
          newDistributionInput,
        );
      } catch (ex) {
        expect(ex).to.not.be.undefined;
        expect(startTransactionStub.calledOnce).to.be.true;
        expect(commitTransactionStub.called).to.be.false;
        expect(rollbackTransactionStub.calledOnce).to.be.true;
      }
    });

    it("Should abort and rollback if adding link between old and new distribution fails", async () => {
      queryStub.onThirdCall().rejects();

      try {
        await DAO.avtalegiroagreements.replaceDistribution(
          originalDistribution,
          newKid,
          newDistributionInput,
        );
      } catch (ex) {
        expect(ex).to.not.be.undefined;
        expect(startTransactionStub.calledOnce).to.be.true;
        expect(commitTransactionStub.called).to.be.false;
        expect(rollbackTransactionStub.calledOnce).to.be.true;
      }
    });

    it("Should commit transaction if everything succeeds", async () => {
      await DAO.avtalegiroagreements.replaceDistribution(
        originalDistribution,
        newKid,
        newDistributionInput,
      );

      expect(startTransactionStub.calledOnce).to.be.true;
      expect(commitTransactionStub.calledOnce).to.be.true;
      expect(rollbackTransactionStub.called).to.be.false;
    });

    afterEach(() => {
      sinon.restore();
    });
  });

  describe("queries rewritten for the multiple cause area schema", () => {
    afterEach(() => {
      sinon.restore();
    });

    it("getMissingForDate finds the donor through Distributions", async () => {
      const rows = [{ ID: 1, amount: 500 }];
      const queryStub = sinon.stub(DAO, "query").resolves([rows, []]);

      expect(await DAO.avtalegiroagreements.getMissingForDate(new Date(2024, 10, 19))).to.equal(
        rows,
      );

      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.not.match(/Combining_table|call /i);
      expect(sql).to.contain("INNER JOIN Distributions");
      expect(params).to.deep.equal([
        ...Array(8).fill("2024-11-19"),
        ["CLAIMED", "COMPLETED"],
        "2024-11-19",
        "DELETED",
      ]);
    });

    it("getMissingForDate leaves out agreements claimed on another date that month", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([[], []]);

      await DAO.avtalegiroagreements.getMissingForDate(new Date(2024, 10, 19));

      const [sql] = queryStub.firstCall.args;
      expect(sql).to.contain("FROM Avtalegiro_agreement_charges AS C");
      expect(sql).to.contain("C.due_date <> DATE(?)");
      expect(sql).to.contain("C.status IN (?)");
    });

    it("getRecievedDonationsForDate maps donations", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([
        [
          {
            ID: 3,
            email: "a@b",
            full_name: "Ola",
            sum_confirmed: "400.00",
            transaction_cost: "2.00",
            KID_fordeling: "123",
            timestamp_confirmed: new Date(2024, 10, 19),
          },
        ],
        [],
      ]);

      const result = await DAO.avtalegiroagreements.getRecievedDonationsForDate(
        new Date(2024, 10, 19),
      );

      expect(queryStub.firstCall.args[0]).to.not.match(/Combining_table|call /i);
      expect(result).to.deep.equal([
        {
          id: 3,
          kid: "123",
          paymentMethod: "AvtaleGiro",
          email: "a@b",
          donor: "Ola",
          sum: "400.00",
          transactionCost: "2.00",
          timestamp: new Date(2024, 10, 19),
        },
      ]);
    });

    it("getAgreement returns the donor id separately from the agreement id", async () => {
      const queryStub = sinon.stub(DAO, "query").resolves([[{ ID: 7, donorId: 12 }], []]);
      expect(await DAO.avtalegiroagreements.getAgreement(7)).to.deep.equal({ ID: 7, donorId: 12 });
      expect(queryStub.firstCall.args[0]).to.contain("Donors.ID as donorId");
    });
  });
});
