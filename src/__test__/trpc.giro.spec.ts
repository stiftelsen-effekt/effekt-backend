import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { parseClaimFile } from "../custom_modules/DAO_modules/avtalegiroagreements";
import { donationHelpers } from "../custom_modules/donationHelpers";
import * as mail from "../custom_modules/mail";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]);

const expectTRPCError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

/** An agreement split: the donor is always the agreement's */
const distribution = {
  taxUnitId: null,
  causeAreas: [
    {
      id: 1,
      standardSplit: true,
      percentageShare: "100",
      organizations: [{ id: 5, percentageShare: "100" }],
    },
  ],
};

/** Stubs the lookups assertDistributionReferences checks the split against */
const stubReferences = () => ({
  donor: sinon.stub(DAO.donors, "getByID").resolves({ id: 12 } as any),
  organizations: sinon
    .stub(DAO.organizations, "getByIDs")
    .resolves([{ ID: 5, cause_area_ID: 1 }] as any),
});

describe("tRPC giro router", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("auth and input validation", () => {
    it("rejects anonymous callers", async () => {
      const stub = sinon.stub(DAO.avtalegiroagreements, "getAgreementSumHistogram").resolves([]);
      await expectTRPCError(callerWith().giro.avtalegiro.histogram(), "UNAUTHORIZED");
      await expectTRPCError(callerWith().giro.autogiro.shipments.list(), "UNAUTHORIZED");
      expect(stub.called).to.be.false;
    });

    it("rejects authenticated callers without the admin permission", async () => {
      const stub = sinon.stub(DAO.autogiroagreements, "getAllShipments").resolves([]);
      await expectTRPCError(
        callerWith(["read:profile"]).giro.autogiro.shipments.list(),
        "FORBIDDEN",
      );
      await expectTRPCError(
        callerWith(["read:profile", "write:agreements"]).giro.avtalegiro.updateStatus({
          KID: "123",
          active: false,
        }),
        "FORBIDDEN",
      );
      expect(stub.called).to.be.false;
    });

    it("rejects invalid input before touching the DAO", async () => {
      const agStub = sinon.stub(DAO.autogiroagreements, "getAgreements");
      const avStub = sinon.stub(DAO.avtalegiroagreements, "updatePaymentDate");
      await expectTRPCError(
        admin().giro.autogiro.list({
          page: 0,
          limit: 10,
          sort: { id: "ID; DROP TABLE Donors" as any, desc: true },
        }),
        "BAD_REQUEST",
      );
      await expectTRPCError(admin().giro.autogiro.list({ page: -1, limit: 10 }), "BAD_REQUEST");
      await expectTRPCError(
        admin().giro.avtalegiro.updatePaymentDate({ KID: "123", paymentDate: 29 }),
        "BAD_REQUEST",
      );
      await expectTRPCError(admin().giro.avtalegiro.missing({ date: "2026-13-01" }), "BAD_REQUEST");
      await expectTRPCError(
        admin().giro.autogiro.list({ page: 0, limit: 10, unknown: true } as any),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.list({ page: 0, limit: 10, filter: { amont: {} } } as any),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.updateAmount({ KID: "123", amount: 100.5 }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.updateAmount({ KID: "123", amount: 21_474_837 }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.autogiro.updateAmount({ KID: "123", amount: 10.5 }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.autogiro.updateAmount({ KID: "123", amount: 2_147_483_648 }),
        "BAD_REQUEST",
      );
      expect(agStub.called).to.be.false;
      expect(avStub.called).to.be.false;
    });
  });

  describe("avtalegiro", () => {
    const agreement = {
      id: 1,
      KID: "002345678901234",
      amount: 50000,
      paymentDate: 5,
      notice: true,
    };
    let changeStub: sinon.SinonStub;

    beforeEach(() => {
      changeStub = sinon.stub(mail, "sendAvtaleGiroChange").resolves(false);
    });

    it("lists agreements with converted filter dates and boolean flags", async () => {
      const row = {
        ID: 1,
        active: 1 as const,
        KID: "123",
        payment_date: 5,
        created: new Date(),
        cancelled: null,
        last_updated: new Date(),
        notice: 0 as const,
        full_name: "Ola",
        amount: 500,
      };
      const statistics = { numAgreements: 1, sumAgreements: 500, avgAgreement: 500 };
      const stub = sinon
        .stub(DAO.avtalegiroagreements, "getAgreements")
        .resolves({ rows: [row], statistics, pages: 1 });
      const res = await admin().giro.avtalegiro.list({
        page: 2,
        limit: 25,
        sort: { id: "paymentDate", desc: false },
        filter: {
          amount: { from: 100 },
          created: { from: "2026-01-02" },
          statuses: [1],
          donor: "Ola",
        },
      });
      expect(res).to.deep.equal({
        rows: [{ ...row, active: true, notice: false }],
        statistics,
        pages: 1,
      });
      const [sort, page, limit, filter] = stub.firstCall.args;
      expect(sort).to.deep.equal({ id: "paymentDate", desc: false });
      expect(page).to.equal(2);
      expect(limit).to.equal(25);
      expect(filter!.amount).to.deep.equal({ from: 100 });
      expect(filter!.createdRange).to.deep.equal({
        from: new Date("2026-01-01T23:00:00Z"),
        before: undefined,
      });
      expect(filter!.statuses).to.deep.equal([1]);
    });

    it("exports agreements as csv", async () => {
      const stub = sinon.stub(DAO.avtalegiroagreements, "getAgreements").resolves({
        rows: [
          {
            ID: 1,
            KID: "123",
            amount: 500,
            full_name: "Ola, Nordmann",
            active: 1,
            notice: 0,
          } as any,
        ],
        statistics: { numAgreements: 1, sumAgreements: 500, avgAgreement: 500 },
        pages: 1,
      });
      const res = await admin().giro.avtalegiro.export({});
      expect(stub.firstCall.args[2]).to.equal(Number.MAX_SAFE_INTEGER);
      expect(res.filename).to.match(/^avtalegiro-agreements-.*\.csv$/);
      // Flags are booleans like the list (and the AutoGiro export)
      expect(res.csv).to.equal(
        '\uFEFFID,KID,amount,full_name,active,notice\n1,123,500,"Ola, Nordmann",Yes,No',
      );
    });

    it("gets an agreement with its distribution, amount in NOK and boolean flags", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getAgreement").resolves({
        ID: 7,
        KID: "123",
        amount: "500",
        active: 1,
        notice: 0,
        donorId: 12,
      } as any);
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({ kid: "123" } as any);
      const res = await admin().giro.avtalegiro.get({ id: 7 });
      expect(res).to.deep.include({
        ID: 7,
        KID: "123",
        amount: 500,
        active: true,
        notice: false,
        donorId: 12,
        distribution: { kid: "123" },
      });
    });

    it("returns NOT_FOUND for a missing agreement", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getAgreement").resolves(false);
      await expectTRPCError(admin().giro.avtalegiro.get({ id: 7 }), "NOT_FOUND");
    });

    it("returns an agreement's payments across its KIDs, NOT_FOUND when missing", async () => {
      const payments = {
        KIDs: ["111", "222"],
        donations: [
          {
            id: 2,
            sum: "100.00",
            transactionCost: null,
            timestamp: new Date("2026-02-01"),
            paymentMethod: "AvtaleGiro",
            KID: "111",
          },
          {
            id: 1,
            sum: "100.00",
            transactionCost: null,
            timestamp: new Date("2026-01-01"),
            paymentMethod: "AvtaleGiro",
            KID: "222",
          },
        ],
      };
      const stub = sinon
        .stub(DAO.avtalegiroagreements, "getPaymentsByAgreementId")
        .callsFake(async (agreementId) => (agreementId === 7 ? payments : null));

      expect(await admin().giro.avtalegiro.payments({ agreementId: 7 })).to.deep.equal(payments);
      await expectTRPCError(admin().giro.avtalegiro.payments({ agreementId: 8 }), "NOT_FOUND");
      await expectTRPCError(
        admin().giro.avtalegiro.payments({ agreementId: "7" } as any),
        "BAD_REQUEST",
      );
      expect(stub.callCount).to.equal(2);
    });

    it("follows the replaced distribution chain for an agreement's KIDs", async () => {
      const query = sinon.stub(DAO, "query");
      query.onFirstCall().resolves([
        [
          { KID: "111", depth: 0 },
          { KID: "222", depth: 1 },
        ],
      ] as any);
      query.onSecondCall().resolves([[]] as any);

      const result = await DAO.avtalegiroagreements.getPaymentsByAgreementId(7);

      expect(query.firstCall.args[0]).to.match(/WITH RECURSIVE/);
      expect(query.firstCall.args[0]).to.match(
        /INNER JOIN agreement_kids K ON R.Original_AvtaleGiro_KID = K.KID/,
      );
      expect(query.firstCall.args[1]).to.deep.equal([7]);
      expect(query.secondCall.args[1]).to.deep.equal([["111", "222"]]);
      expect(result).to.deep.equal({ KIDs: ["111", "222"], donations: [] });

      query.onThirdCall().resolves([[]] as any);
      expect(await DAO.avtalegiroagreements.getPaymentsByAgreementId(8)).to.equal(null);
      expect(query.callCount).to.equal(3);
    });

    it("returns donations, histogram, report and validation", async () => {
      const donation = { id: 1, KID: "123", sum: "1.00" } as any;
      const bucket = { bucket: 0, items: 1, bar: 0 };
      const validation = { date: 5, expected: "500", actual: "0", diff: "-500" };
      sinon
        .stub(DAO.avtalegiroagreements, "getDonationsByKID")
        .withArgs("123")
        .resolves([donation]);
      sinon.stub(DAO.avtalegiroagreements, "getAgreementSumHistogram").resolves([bucket]);
      sinon.stub(DAO.avtalegiroagreements, "getAgreementReport").resolves({
        activeAgreementCount: 3,
        averageAgreementSum: "752",
        sumStoppedThisMonth: null,
      } as any);
      sinon.stub(DAO.avtalegiroagreements, "getValidationTable").resolves([validation]);
      expect(await admin().giro.avtalegiro.donations({ KID: "123" })).to.deep.equal([donation]);
      expect(await admin().giro.avtalegiro.histogram()).to.deep.equal([bucket]);
      expect(await admin().giro.avtalegiro.report()).to.deep.equal({
        activeAgreementCount: 3,
        averageAgreementSum: 752,
        totalAgreementSum: 0,
        medianAgreementSum: 0,
        draftedThisMonth: 0,
        sumDraftedThisMonth: 0,
        activatedThisMonth: 0,
        sumActivatedThisMonth: 0,
        stoppedThisMonth: 0,
        sumStoppedThisMonth: 0,
      });
      expect(await admin().giro.avtalegiro.validation()).to.deep.equal([validation]);
    });

    it("returns missing, received and expected for a date", async () => {
      const missing = sinon
        .stub(DAO.avtalegiroagreements, "getMissingForDate")
        .resolves([{ ID: 1, amount: 500, active: 1 } as any]);
      const received = sinon
        .stub(DAO.avtalegiroagreements, "getRecievedDonationsForDate")
        .resolves([{ id: 2 } as any]);
      const expected = sinon
        .stub(DAO.avtalegiroagreements, "getExpectedDonationsForDate")
        .resolves([{ ID: 3, amount: 50050, active: 0, notice: 1 } as any]);
      // No claim file logged for the date
      sinon.stub(DAO.avtalegiroagreements, "getClaimedAgreementsForDate").resolves(null);
      expect(await admin().giro.avtalegiro.missing({ date: "2026-10-05" })).to.deep.equal([
        { ID: 1, amount: 500, active: true },
      ]);
      expect(await admin().giro.avtalegiro.received({ date: "2026-10-05" })).to.deep.equal([
        { id: 2 },
      ]);
      // øre in the DAO, NOK out
      expect(await admin().giro.avtalegiro.expected({ date: "2026-10-05" })).to.deep.equal([
        { ID: 3, amount: 500.5, active: false, notice: true, amountSource: "agreement" },
      ]);
      for (const stub of [missing, received, expected]) {
        const date: Date = stub.firstCall.args[0];
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).to.deep.equal([2026, 9, 5]);
      }
    });

    it("uses the claimed amounts for past dates with a logged claim file", async () => {
      const claimed = sinon
        .stub(DAO.avtalegiroagreements, "getClaimedAgreementsForDate")
        .resolves([{ ID: 3, amount: 40000, active: 1, notice: 0 } as any]);
      const current = sinon
        .stub(DAO.avtalegiroagreements, "getExpectedDonationsForDate")
        .resolves([]);
      expect(await admin().giro.avtalegiro.expected({ date: "2025-10-05" })).to.deep.equal([
        { ID: 3, amount: 400, active: true, notice: false, amountSource: "claim" },
      ]);
      expect(claimed.firstCall.args[0]).to.equal("2025-10-05");
      expect(current.called).to.be.false;

      // Today and later: the agreements' current amounts
      await admin().giro.avtalegiro.expected({ date: "2999-01-01" });
      expect(claimed.calledOnce).to.be.true;
      expect(current.calledOnce).to.be.true;
    });

    it("parses claim lines of a DIRREM file for one due date", () => {
      const claim = (date: string, amount: number, kid: string) =>
        `NY2102300000001${date}`.padEnd(32, "0") +
        String(amount).padStart(17, "0") +
        kid.padStart(25, " ") +
        "000000";
      const file = [
        "NY000010".padEnd(80, "0"),
        "NY210020".padEnd(80, "0"),
        claim("201026", 40000, "000123456789012"),
        "NY210231000000100000OLANORDMANN".padEnd(80, "0"),
        claim("211026", 10000, "000999999999999"),
      ].join("\n");
      expect(parseClaimFile(file, "201026")).to.deep.equal([
        { KID: "000123456789012", amount: 40000 },
      ]);
    });

    it("updates the amount in øre and notifies the donor", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(agreement);
      const stub = sinon.stub(DAO.avtalegiroagreements, "updateAmount").resolves(true);
      expect(await admin().giro.avtalegiro.updateAmount({ KID: "123", amount: 300 })).to.be.true;
      expect(stub.calledWith("123", 30000)).to.be.true;
      expect(changeStub.calledWith("123", "AMOUNT", "300")).to.be.true;
    });

    it("returns NOT_FOUND when updating an unknown agreement", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(null);
      const stub = sinon.stub(DAO.avtalegiroagreements, "updateAmount");
      await expectTRPCError(
        admin().giro.avtalegiro.updateAmount({ KID: "123", amount: 300 }),
        "NOT_FOUND",
      );
      expect(stub.called).to.be.false;
    });

    it("deactivates an agreement and sends the cancellation notice", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(agreement);
      const stub = sinon.stub(DAO.avtalegiroagreements, "setActive").resolves(true);
      expect(await admin().giro.avtalegiro.updateStatus({ KID: "123", active: false })).to.be.true;
      expect(stub.calledWith("123", 0)).to.be.true;
      expect(changeStub.calledWith("123", "CANCELLED")).to.be.true;
    });

    it("activates an agreement without a cancellation notice", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(agreement);
      const stub = sinon.stub(DAO.avtalegiroagreements, "setActive").resolves(true);
      await admin().giro.avtalegiro.updateStatus({ KID: "123", active: true });
      expect(stub.calledWith("123", 1)).to.be.true;
      expect(changeStub.called).to.be.false;
    });

    it("updates the payment date and notifies the donor", async () => {
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(agreement);
      const stub = sinon.stub(DAO.avtalegiroagreements, "updatePaymentDate").resolves(true);
      await admin().giro.avtalegiro.updatePaymentDate({ KID: "123", paymentDate: 0 });
      expect(stub.calledWith("123", 0)).to.be.true;
      expect(changeStub.calledWith("123", "CHARGEDAY", 0)).to.be.true;
    });

    it("replaces the distribution under a new historic KID, keeping the donor", async () => {
      stubReferences();
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(agreement);
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({ kid: "123", donorId: 12 } as any);
      sinon.stub(donationHelpers, "createAvtaleGiroKID").resolves("999");
      const stub = sinon.stub(DAO.avtalegiroagreements, "replaceDistribution").resolves(true);
      await admin().giro.avtalegiro.updateDistribution({ KID: "123", distribution });
      expect(stub.firstCall.args[0]).to.deep.equal({ kid: "123", donorId: 12 });
      expect(stub.firstCall.args[1]).to.equal("999");
      expect(stub.firstCall.args[2]).to.deep.include({ donorId: 12 });
      expect(changeStub.calledWith("123", "SHARES")).to.be.true;
    });

    it("rejects a split with an organization outside its cause area", async () => {
      const refs = stubReferences();
      refs.organizations.resolves([{ ID: 5, cause_area_ID: 2 }] as any);
      sinon.stub(DAO.avtalegiroagreements, "getByKID").resolves(agreement);
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({ kid: "123", donorId: 12 } as any);
      const stub = sinon.stub(DAO.avtalegiroagreements, "replaceDistribution");
      await expectTRPCError(
        admin().giro.avtalegiro.updateDistribution({ KID: "123", distribution }),
        "BAD_REQUEST",
      );
      await expectTRPCError(
        admin().giro.avtalegiro.updateDistribution({
          KID: "123",
          distribution: { ...distribution, donorId: 13 } as any,
        }),
        "BAD_REQUEST",
      );
      expect(stub.called).to.be.false;
    });

    it("rejects an invalid distribution with BAD_REQUEST", async () => {
      const stub = sinon.stub(DAO.avtalegiroagreements, "replaceDistribution");
      await expectTRPCError(
        admin().giro.avtalegiro.updateDistribution({
          KID: "123",
          distribution: {
            ...distribution,
            causeAreas: [{ ...distribution.causeAreas[0], percentageShare: "50" }],
          },
        }),
        "BAD_REQUEST",
      );
      expect(stub.called).to.be.false;
    });
  });

  describe("autogiro", () => {
    const agreement = { ID: 3, KID: "55555555", amount: 200, payment_date: 10 } as any;

    it("lists agreements with a default sort", async () => {
      const result = {
        pages: 0,
        rows: [],
        statistics: { numAgreements: 0, sumAgreements: "0", avgAgreement: "0" },
      };
      const stub = sinon.stub(DAO.autogiroagreements, "getAgreements").resolves(result);
      const res = await admin().giro.autogiro.list({
        page: 0,
        limit: 10,
        filter: { payment_date: { from: 0, to: 15 }, KID: "555" },
      });
      expect(res).to.deep.equal(result);
      expect(stub.firstCall.args[0]).to.deep.equal({ id: "id", desc: true });
      expect(stub.firstCall.args[3]).to.deep.include({
        payment_date: { from: 0, to: 15 },
        KID: "555",
      });
    });

    it("exports agreements as csv", async () => {
      sinon.stub(DAO.autogiroagreements, "getAgreements").resolves({
        pages: 1,
        rows: [{ ID: 1, KID: "555", active: true } as any],
        statistics: { numAgreements: 1, sumAgreements: "1", avgAgreement: "1" },
      });
      const res = await admin().giro.autogiro.export({ sort: { id: "created", desc: true } });
      expect(res.filename).to.match(/^autogiro-agreements-.*\.csv$/);
      expect(res.csv).to.equal("\uFEFFID,KID,active\n1,555,Yes");
    });

    it("gets an agreement with its distribution", async () => {
      sinon.stub(DAO.autogiroagreements, "getAgreementById").withArgs(3).resolves(agreement);
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({ kid: "55555555" } as any);
      const res = await admin().giro.autogiro.get({ id: 3 });
      expect(res).to.deep.include({ ID: 3, distribution: { kid: "55555555" } });
    });

    it("returns NOT_FOUND for a missing agreement", async () => {
      sinon.stub(DAO.autogiroagreements, "getAgreementById").resolves(undefined);
      await expectTRPCError(admin().giro.autogiro.get({ id: 3 }), "NOT_FOUND");
    });

    it("returns donations and histogram", async () => {
      sinon
        .stub(DAO.donations, "getAllByKID")
        .withArgs("555")
        .resolves([{ id: 1 }] as any);
      const bucket = { bucket: 500, items: 1, bar: 0 };
      sinon.stub(DAO.autogiroagreements, "getAgreementSumHistogram").resolves([bucket]);
      expect(await admin().giro.autogiro.donations({ KID: "555" })).to.deep.equal([{ id: 1 }]);
      expect(await admin().giro.autogiro.histogram()).to.deep.equal([bucket]);
    });

    it("updates amount, payment date, status and distribution separately", async () => {
      stubReferences();
      sinon.stub(DAO.autogiroagreements, "getAgreementByKID").resolves(agreement);
      const amount = sinon.stub(DAO.autogiroagreements, "setAgreementAmountByKID").resolves(true);
      const date = sinon.stub(DAO.autogiroagreements, "setAgreementPaymentDateByKID").resolves();
      const activate = sinon.stub(DAO.autogiroagreements, "activateAgreementByKID").resolves();
      const cancel = sinon.stub(DAO.autogiroagreements, "cancelAgreementByKID").resolves();
      sinon.stub(DAO.distributions, "getSplitByKID").resolves({ kid: "555", donorId: 12 } as any);
      sinon.stub(donationHelpers, "createKID").resolves("777");
      const replace = sinon
        .stub(DAO.autogiroagreements, "replaceAgreementDistribution")
        .resolves(true);

      await admin().giro.autogiro.updateAmount({ KID: "555", amount: 250 });
      expect(amount.calledWith("555", 250)).to.be.true;
      expect(date.called || replace.called).to.be.false;

      await admin().giro.autogiro.updatePaymentDate({ KID: "555", paymentDate: 0 });
      expect(date.calledWith("555", 0)).to.be.true;

      await admin().giro.autogiro.activate({ KID: "555" });
      expect(activate.calledWith("555")).to.be.true;
      await admin().giro.autogiro.cancel({ KID: "555" });
      expect(cancel.calledWith("555")).to.be.true;

      await admin().giro.autogiro.updateDistribution({ KID: "555", distribution });
      expect(replace.firstCall.args[0]).to.deep.equal({ kid: "555", donorId: 12 });
      expect(replace.firstCall.args[1]).to.equal("777");
      expect(replace.firstCall.args[2]).to.deep.include({ donorId: 12, taxUnitId: null });
    });

    it("returns NOT_FOUND when editing an unknown agreement", async () => {
      sinon.stub(DAO.autogiroagreements, "getAgreementByKID").resolves(undefined);
      const stub = sinon.stub(DAO.autogiroagreements, "cancelAgreementByKID");
      await expectTRPCError(admin().giro.autogiro.cancel({ KID: "555" }), "NOT_FOUND");
      expect(stub.called).to.be.false;
    });

    it("lists mandates", async () => {
      const stub = sinon
        .stub(DAO.autogiroagreements, "getMandates")
        .resolves({ pages: 1, rows: [{ ID: 1 } as any] });
      const res = await admin().giro.autogiro.mandates.list({
        page: 0,
        limit: 20,
        sort: { id: "created", desc: true },
        filter: { statuses: ["NEW", "ACTIVE"], donor: "Sven" },
      });
      expect(res).to.deep.equal({ pages: 1, rows: [{ ID: 1 }] });
      expect(stub.firstCall.args[3]).to.deep.equal({ statuses: ["NEW", "ACTIVE"], donor: "Sven" });
    });

    it("gets a mandate, mapping the DAO's empty object to NOT_FOUND", async () => {
      const stub = sinon.stub(DAO.autogiroagreements, "getMandateById");
      stub.withArgs(1).resolves({ ID: 1, KID: "555", status: "ACTIVE" } as any);
      stub.withArgs(2).resolves({} as any);
      expect(await admin().giro.autogiro.mandates.get({ id: 1 })).to.deep.include({ ID: 1 });
      await expectTRPCError(admin().giro.autogiro.mandates.get({ id: 2 }), "NOT_FOUND");
    });

    it("lists shipments and downloads a shipment report", async () => {
      sinon.stub(DAO.autogiroagreements, "getAllShipments").resolves([{ ID: 4 } as any]);
      const fileStub = sinon.stub(DAO.logging, "getAutoGiroShipmentFile");
      fileStub.withArgs(4).resolves({ fileContents: "01...", filename: "BFEP.IAGAG.4.261026" });
      fileStub.withArgs(5).resolves(null);
      expect(await admin().giro.autogiro.shipments.list()).to.deep.equal([{ ID: 4 }]);
      expect(await admin().giro.autogiro.shipments.report({ id: 4 })).to.deep.equal({
        filename: "BFEP.IAGAG.4.261026",
        contentType: "text/plain",
        content: "01...",
      });
      await expectTRPCError(admin().giro.autogiro.shipments.report({ id: 5 }), "NOT_FOUND");
    });

    it("creates a shipment the same way as POST /scheduled/autogiro", async () => {
      sinon.stub(DAO.autogiroagreements, "getAgreementsToCharge").resolves([]);
      sinon.stub(DAO.autogiroagreements, "getMandatesByStatus").withArgs("NEW").resolves([]);
      sinon.stub(DAO.autogiroagreements, "getAmendmentCandidates").resolves([]);
      const addShipment = sinon.stub(DAO.autogiroagreements, "addShipment");
      const log = sinon.stub(DAO.logging, "add").resolves();
      const res = await admin().giro.autogiro.shipments.create();
      expect(res).to.deep.equal({
        shipmentID: null,
        numCharges: 0,
        numMandatesToBeConfirmed: 0,
        file: null,
        filename: null,
      });
      expect(addShipment.called).to.be.false;
      // The log entry keeps the service's own shape
      expect(log.firstCall.args[0]).to.equal("AutoGiro");
    });
  });
});
