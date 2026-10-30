import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import sinon from "sinon";
import { expect } from "chai";
import express from "express";
import bodyParser from "body-parser";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";
import { replaceAvtaleGiroDistribution } from "../custom_modules/avtalegiro";
import { replaceAutoGiroDistribution } from "../custom_modules/autogiro";
import { updateAgreementDistribution } from "../custom_modules/vippsService";
import {
  assertDistributionOwnedBy,
  DistributionOwnershipError,
} from "../custom_modules/distributionOwnership";

const mail = require("../custom_modules/mail");

const OWNER = 7;
const OTHER = 8;

const causeAreas = [
  {
    id: 1,
    standardSplit: false,
    percentageShare: "100",
    organizations: [
      { id: 5, percentageShare: "60" },
      { id: 6, percentageShare: "40" },
    ],
  },
];

const taxUnits: Record<number, { id: number; donorId: number; archived: string | null }> = {
  70: { id: 70, donorId: OWNER, archived: null },
  71: { id: 71, donorId: OWNER, archived: "2025-01-01" },
  80: { id: 80, donorId: OTHER, archived: null },
};

describe("distribution ownership", () => {
  let server: express.Express;
  let replaceAvtaleGiroStub: sinon.SinonStub;
  let replaceAutoGiroStub: sinon.SinonStub;
  let addDistributionStub: sinon.SinonStub;

  beforeAll(() => {
    // These must be stubbed before importing the routes
    sinon.stub(authMiddleware, "auth").returns([]);
    sinon.stub(authMiddleware, "checkDonorOwnsDistribution").callsFake((_, req, res, next) => {
      next();
    });

    sinon.stub(DAO.tax, "getById").callsFake(async (id: number) => (taxUnits[id] as any) ?? null);
    sinon
      .stub(DAO.distributions, "getSplitByKID")
      .resolves({ kid: "1234567", donorId: OWNER, taxUnitId: 70, causeAreas } as any);
    replaceAvtaleGiroStub = sinon.stub(DAO.avtalegiroagreements, "replaceDistribution").resolves();
    replaceAutoGiroStub = sinon
      .stub(DAO.autogiroagreements, "replaceAgreementDistribution")
      .resolves();
    sinon.stub(donationHelpers, "createAvtaleGiroKID").resolves("99999999");
    sinon.stub(donationHelpers, "createKID").resolves("88888888");
    sinon.stub(DAO.vipps, "getAgreement").resolves({ ID: "agr_1", donorID: OWNER } as any);
    sinon.stub(DAO.distributions, "getKIDbySplit").resolves(null as any);
    addDistributionStub = sinon.stub(DAO.distributions, "add").resolves();
    sinon.stub(DAO.vipps, "updateAgreementKID").resolves(true as any);
    sinon.stub(mail, "sendAvtaleGiroChange").resolves(true);
    sinon.stub(mail, "sendVippsAgreementChange").resolves(true);

    const avtalegiroRouter = require("../routes/avtalegiro");
    server = express();
    server.use(bodyParser.json());
    server.use("/avtalegiro", avtalegiroRouter);
    server.use((err: any, req: any, res: any, next: any) =>
      res.status(err.status ?? err.ex?.status ?? 500).json({ status: err.status ?? 500 }),
    );
  });

  afterAll(() => {
    sinon.restore();
  });

  beforeEach(() => {
    sinon.resetHistory();
  });

  describe("assertDistributionOwnedBy", () => {
    it("accepts the owner with no tax unit or an active own tax unit", async () => {
      await assertDistributionOwnedBy(OWNER, { donorId: OWNER, taxUnitId: null });
      await assertDistributionOwnedBy(OWNER, { donorId: OWNER, taxUnitId: 70 });
    });

    for (const [name, input] of [
      ["another donor", { donorId: OTHER, taxUnitId: null }],
      ["another donor's tax unit", { donorId: OWNER, taxUnitId: 80 }],
      ["an archived own tax unit", { donorId: OWNER, taxUnitId: 71 }],
      ["an unknown tax unit", { donorId: OWNER, taxUnitId: 999 }],
    ] as const) {
      it(`rejects ${name}`, async () => {
        let error: unknown;
        try {
          await assertDistributionOwnedBy(OWNER, input);
        } catch (ex) {
          error = ex;
        }
        expect(error).to.be.instanceOf(DistributionOwnershipError);
      });
    }
  });

  describe("AvtaleGiro and AutoGiro services", () => {
    for (const [name, input] of [
      ["another donor", { donorId: OTHER, taxUnitId: 80 }],
      ["the owner with another donor's tax unit", { donorId: OWNER, taxUnitId: 80 }],
    ] as const) {
      it(`refuse ${name} without writing`, async () => {
        let avtaleGiroError: unknown;
        let autoGiroError: unknown;
        await replaceAvtaleGiroDistribution("1234567", { ...input, causeAreas } as any).catch(
          (ex) => (avtaleGiroError = ex),
        );
        await replaceAutoGiroDistribution("1234567", { ...input, causeAreas } as any).catch(
          (ex) => (autoGiroError = ex),
        );
        expect(avtaleGiroError).to.be.instanceOf(DistributionOwnershipError);
        expect(autoGiroError).to.be.instanceOf(DistributionOwnershipError);
        expect(replaceAvtaleGiroStub.called).to.be.false;
        expect(replaceAutoGiroStub.called).to.be.false;
      });
    }

    it("still replace the owner's own distribution", async () => {
      await replaceAvtaleGiroDistribution("1234567", {
        donorId: OWNER,
        taxUnitId: 70,
        causeAreas,
      } as any);
      expect(replaceAvtaleGiroStub.calledOnce).to.be.true;
    });
  });

  describe("POST /avtalegiro/:KID/distribution", () => {
    it("rejects a body naming another donor and their tax unit (400, no write)", async () => {
      await request(server)
        .post("/avtalegiro/1234567/distribution")
        .send({ distribution: { donorId: OTHER, taxUnitId: 80, causeAreas } })
        .expect(400);
      expect(replaceAvtaleGiroStub.called).to.be.false;
    });

    it("rejects another donor's tax unit for the owner (400, no write)", async () => {
      await request(server)
        .post("/avtalegiro/1234567/distribution")
        .send({ distribution: { donorId: OWNER, taxUnitId: 80, causeAreas } })
        .expect(400);
      expect(replaceAvtaleGiroStub.called).to.be.false;
    });

    it("accepts the owner's own tax unit", async () => {
      await request(server)
        .post("/avtalegiro/1234567/distribution")
        .send({ distribution: { donorId: OWNER, taxUnitId: 70, causeAreas } })
        .expect(200);
      expect(replaceAvtaleGiroStub.calledOnce).to.be.true;
    });
  });

  describe("Vipps updateAgreementDistribution", () => {
    it("rejects another donor's tax unit without creating a distribution", async () => {
      const result = await updateAgreementDistribution("agr_1", {
        donorId: OWNER,
        taxUnitId: 80,
        causeAreas,
      } as any);
      expect(result.ok).to.be.false;
      expect(addDistributionStub.called).to.be.false;
    });

    it("accepts the owner's own tax unit", async () => {
      const result = await updateAgreementDistribution("agr_1", {
        donorId: OWNER,
        taxUnitId: 70,
        causeAreas,
      } as any);
      expect(result.ok).to.be.true;
    });
  });
});
