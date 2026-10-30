import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import * as avtalegiro from "../custom_modules/avtalegiro";
import * as donorService from "../custom_modules/donorService";
import * as vippsService from "../custom_modules/vippsService";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const config = require("../config");

const createCaller = createCallerFactory(appRouter);

const callerWith = (payload?: { permissions: string[]; donorId?: number }) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: payload
      ? {
          permissions: payload.permissions,
          ...(payload.donorId !== undefined
            ? { [String(config.authUserIdClaim)]: payload.donorId }
            : {}),
        }
      : undefined,
  });

type Caller = ReturnType<typeof callerWith>;

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code, err.message).to.equal(code);
  }
};

const DONOR = 7;
const OTHER_DONOR = 8;

const dbDonor = { id: DONOR, name: "Jack", email: "jack@overlookhotel.com", newsletter: true };
const ownTaxUnit = { id: 3, donorId: DONOR, name: "Jack", ssn: "15868510045", archived: null };
const othersTaxUnit = { id: 4, donorId: OTHER_DONOR, name: "Wendy", ssn: "15868510126" };
const vippsAgreement = { ID: "agr_own", donorID: DONOR, KID: "000007000000011" };
const KID = "000007000000042";

/** A valid split for an agreement's distribution */
const split = (taxUnitId: number | null = 3) => ({
  taxUnitId,
  causeAreas: [
    {
      id: 1,
      standardSplit: false,
      percentageShare: "100",
      organizations: [
        { id: 1, percentageShare: "40" },
        { id: 3, percentageShare: "60" },
      ],
    },
  ],
});

/**
 * The shared authorization matrix of a mutation: anonymous (401), the donor without `permission`,
 * another donor's id (403) and invalid input (400) never reach `writes`; the donor and an admin do.
 */
const authMatrix = (
  name: string,
  permission: string,
  call: (caller: Caller, donorId: number) => Promise<unknown>,
  invalidInputs: ((caller: Caller) => Promise<unknown>)[],
  writes: () => sinon.SinonStub[],
) => {
  const donor = () => callerWith({ permissions: [permission], donorId: DONOR });
  const assertNoWrites = () => writes().forEach((stub) => expect(stub.called).to.be.false);

  describe(`${name} authorization`, () => {
    it("rejects anonymous callers", async () => {
      await expectTrpcError(call(callerWith(), DONOR), "UNAUTHORIZED");
      assertNoWrites();
    });

    it(`rejects the donor without ${permission}`, async () => {
      const wrongPermission = permission === "write:profile" ? "write:agreements" : "write:profile";
      await expectTrpcError(
        call(
          callerWith({ permissions: [wrongPermission, "read:donations"], donorId: DONOR }),
          DONOR,
        ),
        "FORBIDDEN",
      );
      assertNoWrites();
    });

    it("rejects another donor's id", async () => {
      await expectTrpcError(call(donor(), OTHER_DONOR), "FORBIDDEN");
      assertNoWrites();
    });

    it("rejects invalid input", async () => {
      for (const invalid of invalidInputs) await expectTrpcError(invalid(donor()), "BAD_REQUEST");
      assertNoWrites();
    });

    it("lets the donor and an admin through", async () => {
      await call(donor(), DONOR);
      await call(callerWith({ permissions: [permission, "admin"] }), DONOR);
      expect(writes().some((stub) => stub.called)).to.be.true;
    });
  });
};

describe("tRPC minside mutations", () => {
  let getDonor: sinon.SinonStub;
  let getTaxUnit: sinon.SinonStub;
  let getVippsAgreement: sinon.SinonStub;
  let getDonorByKID: sinon.SinonStub;
  let getAvtaleGiroByKID: sinon.SinonStub;

  const profileDonor = () => callerWith({ permissions: ["write:profile"], donorId: DONOR });
  const agreementDonor = () => callerWith({ permissions: ["write:agreements"], donorId: DONOR });

  beforeEach(() => {
    getDonor = sinon.stub(DAO.donors, "getByID").resolves(dbDonor as any);
    getTaxUnit = sinon
      .stub(DAO.tax, "getById")
      .callsFake(
        async (id: number) => ([ownTaxUnit, othersTaxUnit].find((u) => u.id === id) ?? null) as any,
      );
    getVippsAgreement = sinon
      .stub(DAO.vipps, "getAgreement")
      .callsFake(async (id: string) =>
        id === "agr_own"
          ? (vippsAgreement as any)
          : id === "agr_other"
            ? ({ ...vippsAgreement, ID: id, donorID: OTHER_DONOR } as any)
            : false,
      );
    getDonorByKID = sinon
      .stub(DAO.donors, "getByKID")
      .callsFake(
        async (kid: string) =>
          (kid === KID ? { id: DONOR } : kid === "999" ? { id: OTHER_DONOR } : null) as any,
      );
    getAvtaleGiroByKID = sinon
      .stub(DAO.avtalegiroagreements, "getByKID")
      .callsFake(async (kid: string) => ({ id: 1, KID: kid }) as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("updateProfile", () => {
    let update: sinon.SinonStub;
    beforeEach(() => {
      update = sinon.stub(DAO.donors, "update").resolves(true);
    });

    authMatrix(
      "updateProfile",
      "write:profile",
      (caller, donorId) => caller.minside.updateProfile({ donorId, name: "Jack T" }),
      [
        (c) => c.minside.updateProfile({ donorId: DONOR, name: "" }),
        (c) => c.minside.updateProfile({ donorId: DONOR, name: "x".repeat(256) }),
        (c) => c.minside.updateProfile({ donorId: DONOR, name: 5 } as any),
        (c) => c.minside.updateProfile({ donorId: DONOR, name: "J", newsletter: "yes" } as any),
        // Min Side can't change the email
        (c) => c.minside.updateProfile({ donorId: DONOR, name: "J", email: "x@y.z" } as any),
      ],
      () => [update],
    );

    it("saves the name and newsletter, keeping the email and trash, like REST", async () => {
      const result = await profileDonor().minside.updateProfile({
        donorId: DONOR,
        name: "Jack T",
        newsletter: false,
      });
      expect(result).to.equal(true);
      expect(update.calledOnceWithExactly(DONOR, "Jack T", dbDonor.email, false, undefined)).to.be
        .true;
    });

    it("stores a missing newsletter as null, like REST", async () => {
      await profileDonor().minside.updateProfile({ donorId: DONOR, name: "Jack" });
      expect(update.firstCall.args[3]).to.equal(null);
    });

    it("answers NOT_FOUND for a missing donor and fails when nothing was updated", async () => {
      getDonor.resolves(null);
      await expectTrpcError(
        profileDonor().minside.updateProfile({ donorId: DONOR, name: "J" }),
        "NOT_FOUND",
      );
      expect(update.called).to.be.false;
      getDonor.resolves(dbDonor);
      update.resolves(false);
      await expectTrpcError(
        profileDonor().minside.updateProfile({ donorId: DONOR, name: "J" }),
        "INTERNAL_SERVER_ERROR",
      );
    });
  });

  describe("createTaxUnit", () => {
    let create: sinon.SinonStub;
    beforeEach(() => {
      create = sinon
        .stub(donorService, "createTaxUnitForDonor")
        .resolves({ ...ownTaxUnit, id: 9, registered: new Date() } as any);
    });

    authMatrix(
      "createTaxUnit",
      "write:profile",
      (caller, donorId) =>
        caller.minside.createTaxUnit({ donorId, name: "Danny", ssn: "15868520008" }),
      [
        (c) => c.minside.createTaxUnit({ donorId: DONOR, name: "", ssn: "15868520008" }),
        (c) => c.minside.createTaxUnit({ donorId: DONOR, name: "D", ssn: "1234567890" }),
        (c) => c.minside.createTaxUnit({ donorId: DONOR, name: "D", ssn: "12345678a" }),
        // 11 digits that fail the fødselsnummer check, as REST
        (c) => c.minside.createTaxUnit({ donorId: DONOR, name: "D", ssn: "15868520009" }),
        (c) =>
          c.minside.createTaxUnit({
            donorId: DONOR,
            name: "D",
            ssn: "910000004",
            locale: "DK",
          } as any),
      ],
      () => [create],
    );

    it("creates the unit with the same service call as REST and returns it", async () => {
      const unit = await profileDonor().minside.createTaxUnit({
        donorId: DONOR,
        name: "Firma AS",
        ssn: "910000004",
      });
      expect(create.calledOnceWithExactly(DONOR, "910000004", "Firma AS", "NO")).to.be.true;
      expect(unit).to.deep.equal({
        id: 9,
        donorId: DONOR,
        name: "Jack",
        ssn: "15868510045",
        archived: null,
      });
    });

    it("passes the locale on and accepts the Swedish 13 character number", async () => {
      await profileDonor().minside.createTaxUnit({
        donorId: DONOR,
        name: "Sven",
        ssn: "19900101-1234",
        locale: "SV",
      });
      expect(create.firstCall.args[3]).to.equal("SV");
    });
  });

  describe("updateTaxUnit", () => {
    let update: sinon.SinonStub;
    beforeEach(() => {
      update = sinon.stub(DAO.tax, "updateTaxUnit").resolves(1);
    });

    authMatrix(
      "updateTaxUnit",
      "write:profile",
      (caller, donorId) =>
        caller.minside.updateTaxUnit({ donorId, taxUnitId: 3, name: "Jack", ssn: "15868520008" }),
      [
        (c) =>
          c.minside.updateTaxUnit({ donorId: DONOR, taxUnitId: 0, name: "J", ssn: "910000004" }),
        (c) =>
          c.minside.updateTaxUnit({ donorId: DONOR, taxUnitId: 3, name: "", ssn: "910000004" }),
        // REST only takes 9 or 11 characters when updating
        (c) =>
          c.minside.updateTaxUnit({
            donorId: DONOR,
            taxUnitId: 3,
            name: "J",
            ssn: "19900101-1234",
          }),
        (c) =>
          c.minside.updateTaxUnit({ donorId: DONOR, taxUnitId: 3, name: "J", ssn: "15868520009" }),
      ],
      () => [update],
    );

    it("updates only name and ssn of the donor's unit", async () => {
      const unit = await profileDonor().minside.updateTaxUnit({
        donorId: DONOR,
        taxUnitId: 3,
        name: "Jack T",
        ssn: "15868520008",
      });
      expect(update.calledOnceWithExactly(3, { ...ownTaxUnit, name: "Jack T", ssn: "15868520008" }))
        .to.be.true;
      expect(unit).to.deep.include({ id: 3, donorId: DONOR, name: "Jack T", ssn: "15868520008" });
    });

    it("answers NOT_FOUND for another donor's or a missing unit, without writing", async () => {
      for (const taxUnitId of [4, 99]) {
        await expectTrpcError(
          profileDonor().minside.updateTaxUnit({
            donorId: DONOR,
            taxUnitId,
            name: "J",
            ssn: "910000004",
          }),
          "NOT_FOUND",
        );
      }
      expect(update.called).to.be.false;
    });
  });

  describe("deleteTaxUnit", () => {
    let archive: sinon.SinonStub;
    beforeEach(() => {
      archive = sinon.stub(donorService, "archiveTaxUnit").resolves(1);
    });

    authMatrix(
      "deleteTaxUnit",
      "write:profile",
      (caller, donorId) => caller.minside.deleteTaxUnit({ donorId, taxUnitId: 3 }),
      [
        (c) => c.minside.deleteTaxUnit({ donorId: DONOR, taxUnitId: -3 }),
        (c) => c.minside.deleteTaxUnit({ donorId: DONOR, taxUnitId: 3, transferTaxUnitId: 1.5 }),
      ],
      () => [archive],
    );

    it("archives with the same service call as REST", async () => {
      expect(await profileDonor().minside.deleteTaxUnit({ donorId: DONOR, taxUnitId: 3 })).to.equal(
        true,
      );
      expect(archive.calledOnceWithExactly(DONOR, 3, undefined)).to.be.true;
    });

    it("only transfers to one of the donor's own units", async () => {
      await expectTrpcError(
        profileDonor().minside.deleteTaxUnit({
          donorId: DONOR,
          taxUnitId: 3,
          transferTaxUnitId: 4,
        }),
        "NOT_FOUND",
      );
      expect(archive.called).to.be.false;
    });

    it("maps the service's NOT_FOUND (another donor's unit)", async () => {
      archive.rejects(
        new donorService.DonorServiceError("NOT_FOUND", "No tax unit found with ID 4"),
      );
      await expectTrpcError(
        profileDonor().minside.deleteTaxUnit({ donorId: DONOR, taxUnitId: 4 }),
        "NOT_FOUND",
      );
    });
  });

  describe("Vipps agreements", () => {
    let cancel: sinon.SinonStub;
    let price: sinon.SinonStub;
    let chargeDay: sinon.SinonStub;
    let distribution: sinon.SinonStub;
    const vippsWrites = () => [cancel, price, chargeDay, distribution];

    beforeEach(() => {
      cancel = sinon.stub(vippsService, "cancelAgreement").resolves(true);
      price = sinon.stub(vippsService, "updateAgreementPrice").resolves(true);
      chargeDay = sinon.stub(vippsService, "updateAgreementChargeDay").resolves(1 as any);
      distribution = sinon
        .stub(vippsService, "updateAgreementDistribution")
        .resolves({ ok: true, KID: "123" });
    });

    authMatrix(
      "cancelVippsAgreement",
      "write:agreements",
      (caller, donorId) => caller.minside.cancelVippsAgreement({ donorId, agreementId: "agr_own" }),
      [
        (c) => c.minside.cancelVippsAgreement({ donorId: DONOR, agreementId: "" }),
        (c) => c.minside.cancelVippsAgreement({ donorId: DONOR, agreementId: "a".repeat(21) }),
      ],
      vippsWrites,
    );

    authMatrix(
      "updateVippsAgreementPrice",
      "write:agreements",
      (caller, donorId) =>
        caller.minside.updateVippsAgreementPrice({ donorId, agreementId: "agr_own", amount: 300 }),
      [0, -1, 2.5, 1_000_001].map(
        (amount) => (c: Caller) =>
          c.minside.updateVippsAgreementPrice({ donorId: DONOR, agreementId: "agr_own", amount }),
      ),
      vippsWrites,
    );

    authMatrix(
      "updateVippsAgreementChargeDay",
      "write:agreements",
      (caller, donorId) =>
        caller.minside.updateVippsAgreementChargeDay({
          donorId,
          agreementId: "agr_own",
          chargeDay: 5,
        }),
      [-1, 29, 1.5].map(
        (chargeDay) => (c: Caller) =>
          c.minside.updateVippsAgreementChargeDay({
            donorId: DONOR,
            agreementId: "agr_own",
            chargeDay,
          }),
      ),
      vippsWrites,
    );

    authMatrix(
      "updateVippsAgreementDistribution",
      "write:agreements",
      (caller, donorId) =>
        caller.minside.updateVippsAgreementDistribution({
          donorId,
          agreementId: "agr_own",
          distribution: split(),
        }),
      [
        (c) =>
          c.minside.updateVippsAgreementDistribution({
            donorId: DONOR,
            agreementId: "agr_own",
            distribution: { ...split(), donorId: OTHER_DONOR } as any,
          }),
        (c) =>
          c.minside.updateVippsAgreementDistribution({
            donorId: DONOR,
            agreementId: "agr_own",
            distribution: { taxUnitId: null, causeAreas: [] },
          }),
        (c) =>
          c.minside.updateVippsAgreementDistribution({
            donorId: DONOR,
            agreementId: "agr_own",
            distribution: {
              taxUnitId: null,
              causeAreas: [{ ...split().causeAreas[0], percentageShare: "1e2" }],
            },
          }),
      ],
      vippsWrites,
    );

    it("calls the Vipps service like REST: price in øre, charge day, cancel", async () => {
      const donor = agreementDonor();
      await donor.minside.updateVippsAgreementPrice({
        donorId: DONOR,
        agreementId: "agr_own",
        amount: 300,
      });
      expect(price.calledOnceWithExactly("agr_own", 30000)).to.be.true;
      await donor.minside.updateVippsAgreementChargeDay({
        donorId: DONOR,
        agreementId: "agr_own",
        chargeDay: 0,
      });
      expect(chargeDay.calledOnceWithExactly("agr_own", 0)).to.be.true;
      await donor.minside.cancelVippsAgreement({ donorId: DONOR, agreementId: "agr_own" });
      expect(cancel.calledOnceWithExactly("agr_own")).to.be.true;
    });

    it("fails when Vipps refuses the price change or cancellation, as REST answers 500", async () => {
      price.resolves(false);
      cancel.resolves(false);
      const donor = agreementDonor();
      await expectTrpcError(
        donor.minside.updateVippsAgreementPrice({
          donorId: DONOR,
          agreementId: "agr_own",
          amount: 1,
        }),
        "INTERNAL_SERVER_ERROR",
      );
      await expectTrpcError(
        donor.minside.cancelVippsAgreement({ donorId: DONOR, agreementId: "agr_own" }),
        "INTERNAL_SERVER_ERROR",
      );
    });

    it("passes the split with the donor's id to the service and returns the KID", async () => {
      const result = await agreementDonor().minside.updateVippsAgreementDistribution({
        donorId: DONOR,
        agreementId: "agr_own",
        distribution: split(),
      });
      expect(result).to.deep.equal({ KID: "123" });
      expect(distribution.calledOnceWithExactly("agr_own", { donorId: DONOR, ...split() })).to.be
        .true;
    });

    it("maps the service's validation errors to BAD_REQUEST", async () => {
      distribution.resolves({ ok: false, status: 400, message: "do not sum to 100" });
      await expectTrpcError(
        agreementDonor().minside.updateVippsAgreementDistribution({
          donorId: DONOR,
          agreementId: "agr_own",
          distribution: split(),
        }),
        "BAD_REQUEST",
      );
    });

    it("answers NOT_FOUND for another donor's or a missing agreement, without calling Vipps", async () => {
      const donor = agreementDonor();
      for (const agreementId of ["agr_other", "agr_missing"]) {
        await expectTrpcError(
          donor.minside.cancelVippsAgreement({ donorId: DONOR, agreementId }),
          "NOT_FOUND",
        );
        await expectTrpcError(
          donor.minside.updateVippsAgreementPrice({ donorId: DONOR, agreementId, amount: 100 }),
          "NOT_FOUND",
        );
        await expectTrpcError(
          donor.minside.updateVippsAgreementChargeDay({
            donorId: DONOR,
            agreementId,
            chargeDay: 3,
          }),
          "NOT_FOUND",
        );
        await expectTrpcError(
          donor.minside.updateVippsAgreementDistribution({
            donorId: DONOR,
            agreementId,
            distribution: split(),
          }),
          "NOT_FOUND",
        );
      }
      vippsWrites().forEach((stub) => expect(stub.called).to.be.false);
    });

    it("refuses another donor's tax unit in the distribution", async () => {
      await expectTrpcError(
        agreementDonor().minside.updateVippsAgreementDistribution({
          donorId: DONOR,
          agreementId: "agr_own",
          distribution: split(4),
        }),
        "NOT_FOUND",
      );
      expect(distribution.called).to.be.false;
    });

    it("lets an admin change the donor's agreement, not another donor's under this donor id", async () => {
      const admin = callerWith({ permissions: ["write:agreements", "admin"] });
      await admin.minside.cancelVippsAgreement({ donorId: DONOR, agreementId: "agr_own" });
      await expectTrpcError(
        admin.minside.cancelVippsAgreement({ donorId: DONOR, agreementId: "agr_other" }),
        "NOT_FOUND",
      );
      expect(cancel.calledOnce).to.be.true;
      expect(getVippsAgreement.called).to.be.true;
    });
  });

  describe("AvtaleGiro agreements", () => {
    let amount: sinon.SinonStub;
    let paymentDate: sinon.SinonStub;
    let replace: sinon.SinonStub;
    let status: sinon.SinonStub;
    const avtaleGiroWrites = () => [amount, paymentDate, replace, status];

    beforeEach(() => {
      amount = sinon.stub(avtalegiro, "updateAvtaleGiroAmount").resolves(true as any);
      paymentDate = sinon.stub(avtalegiro, "updateAvtaleGiroPaymentDate").resolves(true as any);
      replace = sinon.stub(avtalegiro, "replaceAvtaleGiroDistribution").resolves();
      status = sinon.stub(avtalegiro, "setAvtaleGiroStatus").resolves(true as any);
    });

    const badKids = ["", "12a", "1".repeat(33), "1.5"];

    authMatrix(
      "updateAvtaleGiroAmount",
      "write:agreements",
      (caller, donorId) => caller.minside.updateAvtaleGiroAmount({ donorId, KID, amount: 500 }),
      [
        ...badKids.map(
          (kid) => (c: Caller) =>
            c.minside.updateAvtaleGiroAmount({ donorId: DONOR, KID: kid, amount: 500 }),
        ),
        ...[0, 99.5, 21_474_837].map(
          (value) => (c: Caller) =>
            c.minside.updateAvtaleGiroAmount({ donorId: DONOR, KID, amount: value }),
        ),
      ],
      avtaleGiroWrites,
    );

    authMatrix(
      "updateAvtaleGiroPaymentDate",
      "write:agreements",
      (caller, donorId) =>
        caller.minside.updateAvtaleGiroPaymentDate({ donorId, KID, paymentDate: 15 }),
      [-1, 29, 2.5].map(
        (day) => (c: Caller) =>
          c.minside.updateAvtaleGiroPaymentDate({ donorId: DONOR, KID, paymentDate: day }),
      ),
      avtaleGiroWrites,
    );

    authMatrix(
      "updateAvtaleGiroDistribution",
      "write:agreements",
      (caller, donorId) =>
        caller.minside.updateAvtaleGiroDistribution({ donorId, KID, distribution: split() }),
      [
        (c) =>
          c.minside.updateAvtaleGiroDistribution({
            donorId: DONOR,
            KID,
            distribution: { ...split(), extra: 1 } as any,
          }),
      ],
      avtaleGiroWrites,
    );

    authMatrix(
      "cancelAvtaleGiroAgreement",
      "write:agreements",
      (caller, donorId) => caller.minside.cancelAvtaleGiroAgreement({ donorId, KID }),
      badKids.map(
        (kid) => (c: Caller) => c.minside.cancelAvtaleGiroAgreement({ donorId: DONOR, KID: kid }),
      ),
      avtaleGiroWrites,
    );

    it("calls the same AvtaleGiro functions as REST: amount in øre, payment date, cancel", async () => {
      const donor = agreementDonor();
      await donor.minside.updateAvtaleGiroAmount({ donorId: DONOR, KID, amount: 750 });
      expect(amount.calledOnceWithExactly(KID, 75000)).to.be.true;
      await donor.minside.updateAvtaleGiroPaymentDate({ donorId: DONOR, KID, paymentDate: 0 });
      expect(paymentDate.calledOnceWithExactly(KID, 0)).to.be.true;
      await donor.minside.cancelAvtaleGiroAgreement({ donorId: DONOR, KID });
      expect(status.calledOnceWithExactly(KID, 0)).to.be.true;
    });

    it("replaces the distribution with the donor's id, after validating it like REST", async () => {
      await agreementDonor().minside.updateAvtaleGiroDistribution({
        donorId: DONOR,
        KID,
        distribution: split(null),
      });
      expect(replace.calledOnce).to.be.true;
      expect(replace.firstCall.args[0]).to.equal(KID);
      expect(replace.firstCall.args[1]).to.deep.include({ donorId: DONOR, taxUnitId: null });
    });

    it("refuses shares that don't sum to 100, as validateDistribution does for REST", async () => {
      const distribution = split();
      distribution.causeAreas[0].organizations[0].percentageShare = "30";
      await expectTrpcError(
        agreementDonor().minside.updateAvtaleGiroDistribution({
          donorId: DONOR,
          KID,
          distribution,
        }),
        "BAD_REQUEST",
      );
      expect(replace.called).to.be.false;
    });

    it("answers NOT_FOUND for another donor's KID, an unknown KID or no agreement", async () => {
      const donor = agreementDonor();
      for (const kid of ["999", "123"]) {
        await expectTrpcError(
          donor.minside.updateAvtaleGiroAmount({ donorId: DONOR, KID: kid, amount: 100 }),
          "NOT_FOUND",
        );
        await expectTrpcError(
          donor.minside.updateAvtaleGiroPaymentDate({ donorId: DONOR, KID: kid, paymentDate: 1 }),
          "NOT_FOUND",
        );
        await expectTrpcError(
          donor.minside.updateAvtaleGiroDistribution({
            donorId: DONOR,
            KID: kid,
            distribution: split(),
          }),
          "NOT_FOUND",
        );
        await expectTrpcError(
          donor.minside.cancelAvtaleGiroAgreement({ donorId: DONOR, KID: kid }),
          "NOT_FOUND",
        );
      }
      getAvtaleGiroByKID.resolves(null);
      await expectTrpcError(
        donor.minside.cancelAvtaleGiroAgreement({ donorId: DONOR, KID }),
        "NOT_FOUND",
      );
      avtaleGiroWrites().forEach((stub) => expect(stub.called).to.be.false);
      expect(getDonorByKID.called).to.be.true;
    });

    it("refuses another donor's tax unit in the distribution", async () => {
      await expectTrpcError(
        agreementDonor().minside.updateAvtaleGiroDistribution({
          donorId: DONOR,
          KID,
          distribution: split(4),
        }),
        "NOT_FOUND",
      );
      expect(replace.called).to.be.false;
      expect(getTaxUnit.calledWith(4)).to.be.true;
    });
  });
});
