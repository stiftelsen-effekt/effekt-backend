import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";
import { Distribution } from "../../schemas/types";

describe("DAO distributions.add", () => {
  const standardSplitDistribution: Distribution = {
    kid: "123456789012345",
    donorId: 1,
    taxUnitId: 19,
    causeAreas: [
      {
        id: 1,
        standardSplit: true,
        percentageShare: "100",
        organizations: [
          {
            id: 12,
            percentageShare: "100",
          },
        ],
      },
    ],
  };

  const customSplitDistribution: Distribution = {
    kid: "123456789012345",
    donorId: 1,
    taxUnitId: 19,
    causeAreas: [
      {
        id: 1,
        standardSplit: false,
        percentageShare: "100",
        organizations: [
          {
            id: 1,
            percentageShare: "60",
          },
          {
            id: 2,
            percentageShare: "40",
          },
        ],
      },
    ],
  };

  let transactionQueryStub: sinon.SinonStub;
  let daoQueryStub: sinon.SinonStub;
  let metaStub: sinon.SinonStub;
  let startTransactionStub: sinon.SinonStub;
  let commitTransactionStub: sinon.SinonStub;
  let rollbackTransactionStub: sinon.SinonStub;

  beforeEach(() => {
    transactionQueryStub = sinon.stub();
    metaStub = sinon.stub(DAO.meta, "getDefaultOwnerID").resolves(1);

    const connection = {
      query: transactionQueryStub,
    } as any;

    startTransactionStub = sinon.stub(DAO, "startTransaction").resolves(connection);
    commitTransactionStub = sinon.stub(DAO, "commitTransaction");
    rollbackTransactionStub = sinon.stub(DAO, "rollbackTransaction");
    // Stub DAO.query for getStandardDistributionByCauseAreaID which uses it directly
    daoQueryStub = sinon.stub(DAO, "query");

    // Default: distribution insert succeeds
    transactionQueryStub.onFirstCall().resolves([{ affectedRows: 1 }]);
    // Default: cause area insert succeeds
    transactionQueryStub.onSecondCall().resolves([{ affectedRows: 1, insertId: 100 }]);
    // Default: org insert succeeds
    transactionQueryStub.onThirdCall().resolves([{ affectedRows: 1 }]);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("Should use provided organizations when standardSplit is false", async () => {
    await DAO.distributions.add({ distribution: customSplitDistribution });

    expect(daoQueryStub.called).to.be.false;

    // The third query is the org insert - check the values passed
    const orgInsertArgs = transactionQueryStub.thirdCall.args;
    const orgRows = orgInsertArgs[1][0];
    expect(orgRows).to.have.length(2);
    expect(orgRows[0][1]).to.equal(1); // org id 1
    expect(orgRows[0][2]).to.equal("60"); // percentage
    expect(orgRows[1][1]).to.equal(2); // org id 2
    expect(orgRows[1][2]).to.equal("40"); // percentage
  });

  it("Should resolve standard split from DB when standardSplit is true and preserveOrganizations is false", async () => {
    // getStandardDistributionByCauseAreaID uses DAO.query directly
    daoQueryStub.resolves([[{ ID: 15, full_name: "AGF", std_percentage_share: 100 }], []]);

    await DAO.distributions.add({ distribution: standardSplitDistribution });

    expect(daoQueryStub.calledOnce).to.be.true;

    // The org insert should use the standard split orgs from DB (id 15), not the provided ones (id 12)
    const orgRows = transactionQueryStub.thirdCall.args[1][0];
    expect(orgRows).to.have.length(1);
    expect(orgRows[0][1]).to.equal(15);
  });

  it("Should use provided organizations when standardSplit is true and preserveOrganizations is true", async () => {
    await DAO.distributions.add({
      distribution: standardSplitDistribution,
      preserveOrganizations: true,
    });

    // Should NOT call DAO.query for standard split resolution
    expect(daoQueryStub.called).to.be.false;

    // The org insert should use the provided orgs (id 12), not re-resolve from DB
    const orgRows = transactionQueryStub.thirdCall.args[1][0];
    expect(orgRows).to.have.length(1);
    expect(orgRows[0][1]).to.equal(12);
    expect(orgRows[0][2]).to.equal("100");
  });

  it("Should still store standardSplit flag as true in DB even with preserveOrganizations", async () => {
    await DAO.distributions.add({
      distribution: standardSplitDistribution,
      preserveOrganizations: true,
    });

    // The cause area insert is the second query
    const causeAreaArgs = transactionQueryStub.secondCall.args[1];
    // Fourth param is standard_split (1 = true)
    expect(causeAreaArgs[3]).to.equal(1);
  });

  it("Should get default meta owner ID when none is provided", async () => {
    await DAO.distributions.add({ distribution: customSplitDistribution });

    expect(metaStub.calledOnce).to.be.true;
  });

  it("Should use provided meta owner ID", async () => {
    await DAO.distributions.add({
      distribution: customSplitDistribution,
      metaOwnerID: 42,
    });

    expect(metaStub.called).to.be.false;

    // Check metaOwnerID is passed to the distribution insert (5th param)
    const distInsertArgs = transactionQueryStub.firstCall.args[1];
    expect(distInsertArgs[4]).to.equal(42);
  });

  it("Should use supplied transaction instead of creating one", async () => {
    const externalTransaction = { query: transactionQueryStub } as any;

    await DAO.distributions.add({
      distribution: customSplitDistribution,
      transaction: externalTransaction,
    });

    expect(startTransactionStub.called).to.be.false;
    expect(commitTransactionStub.called).to.be.false;
  });

  it("Should commit transaction when no external transaction is supplied", async () => {
    await DAO.distributions.add({ distribution: customSplitDistribution });

    expect(startTransactionStub.calledOnce).to.be.true;
    expect(commitTransactionStub.calledOnce).to.be.true;
  });

  it("Should rollback on error when no external transaction is supplied", async () => {
    transactionQueryStub.onFirstCall().rejects(new Error("DB error"));

    try {
      await DAO.distributions.add({ distribution: customSplitDistribution });
      expect.fail("Should have thrown");
    } catch (ex) {
      expect(startTransactionStub.calledOnce).to.be.true;
      expect(commitTransactionStub.called).to.be.false;
      expect(rollbackTransactionStub.calledOnce).to.be.true;
    }
  });

  it("Should not rollback on error when external transaction is supplied", async () => {
    const externalTransaction = { query: sinon.stub() } as any;
    externalTransaction.query.onFirstCall().rejects(new Error("DB error"));

    try {
      await DAO.distributions.add({
        distribution: customSplitDistribution,
        transaction: externalTransaction,
      });
      expect.fail("Should have thrown");
    } catch (ex) {
      expect(startTransactionStub.called).to.be.false;
      expect(rollbackTransactionStub.called).to.be.false;
    }
  });
});
