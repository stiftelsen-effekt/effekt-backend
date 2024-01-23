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
});
