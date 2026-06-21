import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";
import { connectDonationsForFirstTaxUnit, setTaxUnitOnDistribution } from "../custom_modules/tax";
import { Distribution } from "../schemas/types";

describe("tax", () => {
  const tcfDistribution: Distribution = {
    kid: "000000001",
    donorId: 1,
    taxUnitId: null,
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

  const customDistribution: Distribution = {
    kid: "000000002",
    donorId: 1,
    taxUnitId: null,
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

  const fundraiserDistribution: Distribution = {
    kid: "000000003",
    donorId: 1,
    taxUnitId: null,
    fundraiserTransactionId: 42,
    causeAreas: [
      {
        id: 1,
        standardSplit: false,
        percentageShare: "100",
        organizations: [
          {
            id: 1,
            percentageShare: "100",
          },
        ],
      },
    ],
  };

  afterEach(() => {
    sinon.restore();
  });

  describe("connectDonationsForFirstTaxUnit", () => {
    let distributionsAddStub: sinon.SinonStub;
    let createKIDStub: sinon.SinonStub;
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers(new Date("2025-06-15").getTime());

      sinon.stub(DAO.distributions, "getAllByDonor").resolves({
        distributions: [tcfDistribution, customDistribution, fundraiserDistribution],
      } as any);
      sinon.stub(DAO.distributions, "connectFirstTaxUnit").resolves();
      distributionsAddStub = sinon.stub(DAO.distributions, "add").resolves(true);
      sinon.stub(DAO.donations, "updateKIDBeforeTimestamp").resolves();

      createKIDStub = sinon.stub(donationHelpers, "createKID");
      createKIDStub.onFirstCall().resolves("NEW_KID_001");
      createKIDStub.onSecondCall().resolves("NEW_KID_002");
    });

    afterEach(() => {
      clock.restore();
    });

    it("Should create replacement distributions for donations before current year", async () => {
      sinon.stub(DAO.donations, "getByDonorId").resolves([
        { KID: "000000001", timestamp: "2024-03-15T00:00:00.000Z" },
        { KID: "000000002", timestamp: "2024-06-01T00:00:00.000Z" },
      ] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      expect(distributionsAddStub.calledTwice).to.be.true;
    });

    it("Should not create replacements for donations in the current year", async () => {
      sinon
        .stub(DAO.donations, "getByDonorId")
        .resolves([{ KID: "000000001", timestamp: "2025-03-15T00:00:00.000Z" }] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      expect(distributionsAddStub.called).to.be.false;
    });

    it("Should pass preserveOrganizations: true when adding replacement distributions", async () => {
      sinon
        .stub(DAO.donations, "getByDonorId")
        .resolves([{ KID: "000000001", timestamp: "2024-03-15T00:00:00.000Z" }] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      expect(distributionsAddStub.calledOnce).to.be.true;
      const addArgs = distributionsAddStub.firstCall.args[0];
      expect(addArgs.preserveOrganizations).to.be.true;
    });

    it("Should preserve original organizations in the replacement distribution", async () => {
      sinon
        .stub(DAO.donations, "getByDonorId")
        .resolves([{ KID: "000000001", timestamp: "2024-03-15T00:00:00.000Z" }] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      const addArgs = distributionsAddStub.firstCall.args[0];
      const distribution = addArgs.distribution;
      // Should keep the original TCF org (id 12), not re-resolve to current standard
      expect(distribution.causeAreas[0].organizations[0].id).to.equal(12);
      expect(distribution.causeAreas[0].standardSplit).to.be.true;
    });

    it("Should use a new KID for the replacement distribution", async () => {
      sinon
        .stub(DAO.donations, "getByDonorId")
        .resolves([{ KID: "000000001", timestamp: "2024-03-15T00:00:00.000Z" }] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      const addArgs = distributionsAddStub.firstCall.args[0];
      expect(addArgs.distribution.kid).to.equal("NEW_KID_001");
    });

    it("Should skip fundraiser distributions", async () => {
      sinon
        .stub(DAO.donations, "getByDonorId")
        .resolves([{ KID: "000000003", timestamp: "2024-03-15T00:00:00.000Z" }] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      expect(distributionsAddStub.called).to.be.false;
    });

    it("Should handle multiple old donations with the same KID", async () => {
      sinon.stub(DAO.donations, "getByDonorId").resolves([
        { KID: "000000001", timestamp: "2024-01-15T00:00:00.000Z" },
        { KID: "000000001", timestamp: "2024-06-15T00:00:00.000Z" },
      ] as any);

      await connectDonationsForFirstTaxUnit(1, 99);

      // Should only create one replacement, since both donations share the same KID
      expect(distributionsAddStub.calledOnce).to.be.true;
    });
  });

  describe("setTaxUnitOnDistribution", () => {
    let distributionsAddStub: sinon.SinonStub;
    let addTaxUnitStub: sinon.SinonStub;
    let createKIDStub: sinon.SinonStub;

    beforeEach(() => {
      sinon.useFakeTimers(new Date("2025-06-15").getTime());

      distributionsAddStub = sinon.stub(DAO.distributions, "add").resolves(true);
      addTaxUnitStub = sinon.stub(DAO.distributions, "addTaxUnitToDistribution").resolves();
      sinon.stub(DAO.donations, "updateKIDBeforeTimestamp").resolves();

      createKIDStub = sinon.stub(donationHelpers, "createKID").resolves("NEW_KID_001");
    });

    it("Should throw if distribution is not found", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves(null);

      try {
        await setTaxUnitOnDistribution("000000001", 99);
        expect.fail("Should have thrown");
      } catch (ex) {
        expect(ex.message).to.equal("Distribution not found");
      }
    });

    it("Should throw if distribution already has a tax unit", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({
        ...tcfDistribution,
        taxUnitId: 50,
      });

      try {
        await setTaxUnitOnDistribution("000000001", 99);
        expect.fail("Should have thrown");
      } catch (ex) {
        expect(ex.message).to.equal("Distribution already has a tax unit");
      }
    });

    it("Should handle fundraiser distributions by setting tax unit directly", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves(fundraiserDistribution);

      await setTaxUnitOnDistribution("000000003", 99);

      expect(addTaxUnitStub.calledOnce).to.be.true;
      expect(addTaxUnitStub.firstCall.args).to.deep.equal(["000000003", 99]);
      expect(distributionsAddStub.called).to.be.false;
    });

    it("Should pass preserveOrganizations: true when creating duplicate distribution", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves(tcfDistribution);

      await setTaxUnitOnDistribution("000000001", 99);

      expect(distributionsAddStub.calledOnce).to.be.true;
      const addArgs = distributionsAddStub.firstCall.args[0];
      expect(addArgs.preserveOrganizations).to.be.true;
    });

    it("Should preserve original organizations in the duplicate distribution", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves(tcfDistribution);

      await setTaxUnitOnDistribution("000000001", 99);

      const addArgs = distributionsAddStub.firstCall.args[0];
      const distribution = addArgs.distribution;
      expect(distribution.causeAreas[0].organizations[0].id).to.equal(12);
      expect(distribution.causeAreas[0].standardSplit).to.be.true;
    });

    it("Should set tax unit on the original distribution after creating duplicate", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves(tcfDistribution);

      await setTaxUnitOnDistribution("000000001", 99);

      expect(addTaxUnitStub.calledOnce).to.be.true;
      expect(addTaxUnitStub.firstCall.args).to.deep.equal(["000000001", 99]);
    });

    it("Should use new KID for the duplicate distribution", async () => {
      sinon.stub(DAO.distributions, "getSplitByKID").resolves(tcfDistribution);

      await setTaxUnitOnDistribution("000000001", 99);

      const addArgs = distributionsAddStub.firstCall.args[0];
      expect(addArgs.distribution.kid).to.equal("NEW_KID_001");
    });
  });
});
