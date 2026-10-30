import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express, { type Request, type Response } from "express";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { getYearlyTaxReports } from "../custom_modules/taxReports";
import { RequestLocale } from "../middleware/locale";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../trpc/router";
import { createCallerFactory } from "../trpc/trpc";

const config = require("../config");

const createCaller = createCallerFactory(appRouter);

/** A verified token's payload: permissions plus, for a donor, the user id claim */
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
    expect(err.code).to.equal(code);
  }
};

/** Rows as the DAO returns them (mysql2: DATETIME and DATE as Date, DECIMAL as string) */
const dbVipps = {
  ID: "agr_5kSeqz",
  status: "ACTIVE",
  donorID: 7,
  full_name: "Jack Torrence",
  KID: "000007000000017",
  timestamp_created: new Date("2024-01-02T03:04:05.000Z"),
  monthly_charge_day: 15,
  force_charge_date: null,
  paused_until_date: null,
  amount: 300,
  agreement_url_code: "secret-url-code",
};
const dbAvtaleGiro = {
  ID: 21,
  active: 1,
  amount: "500",
  KID: "000007000000025",
  payment_date: 20,
  created: new Date("2023-02-03T04:05:06.000Z"),
  cancelled: null,
  last_updated: new Date("2023-02-03T04:05:06.000Z"),
  notice: 1,
  full_name: "Jack Torrence",
};
const dbAutoGiro = {
  ID: 31,
  mandateID: 41,
  KID: "000007000000033",
  amount: 250,
  payment_date: 28,
  notice: true,
  active: false,
  last_updated: new Date("2022-03-04T05:06:07.000Z"),
  created: new Date("2022-03-04T05:06:07.000Z"),
  cancelled: new Date("2022-04-01T00:00:00.000Z"),
};

const dbTaxUnit = {
  id: 3,
  donorId: 7,
  name: "Jack Torrence",
  ssn: "12345678901",
  registered: new Date("2021-02-03T04:05:06.000Z"),
  archived: null,
  sumDonations: "1000",
  numDonations: 1,
  taxDeductions: [],
};
const dbDonation = (id: number, sum: string, taxUnitId: number | null, paymentMethod: string) => ({
  id,
  donor: "Jack Torrence",
  donorId: 7,
  email: "jack@overlookhotel.com",
  sum,
  transactionCost: "0",
  timestamp: new Date("2024-05-06T07:08:09.000Z"),
  paymentMethod,
  KID: "000007000000017",
  taxUnitId,
  metaOwnerId: 3,
});

/** Stubs the DAO calls of the tax report builder; returns the first one (the tax units) */
const stubTaxReportData = () => {
  const taxUnits = sinon.stub(DAO.tax, "getByDonorId").resolves([dbTaxUnit] as any);
  sinon
    .stub(DAO.donations, "getByDonorId")
    .resolves([
      dbDonation(101, "1000.00", 3, "Bank"),
      dbDonation(102, "300.00", null, "Crypto"),
    ] as any);
  sinon.stub(DAO.donations, "getEAFundsDonations").resolves([]);
  return taxUnits;
};

describe("tRPC minside agreements and tax reports", () => {
  afterEach(() => {
    sinon.restore();
  });

  /** Each procedure: the REST route's permission, its DAO stub and what it returns */
  const procedures: {
    name: string;
    stub: () => sinon.SinonStub;
    call: (caller: Caller, input: any) => Promise<unknown>;
    expected?: unknown;
  }[] = [
    {
      name: "vippsAgreements",
      stub: () => sinon.stub(DAO.vipps, "getAgreementsByDonorId").resolves([dbVipps] as any),
      call: (caller, input) => caller.minside.vippsAgreements(input),
      // agreement_url_code and the fields Min Side doesn't read are not declared
      expected: [
        {
          ID: "agr_5kSeqz",
          status: "ACTIVE",
          KID: "000007000000017",
          amount: 300,
          monthly_charge_day: 15,
          timestamp_created: "2024-01-02T03:04:05.000Z",
        },
      ],
    },
    {
      name: "avtaleGiroAgreements",
      stub: () =>
        sinon.stub(DAO.avtalegiroagreements, "getByDonorId").resolves([dbAvtaleGiro] as any),
      call: (caller, input) => caller.minside.avtaleGiroAgreements(input),
      expected: [
        {
          ID: 21,
          active: 1,
          amount: "500",
          KID: "000007000000025",
          payment_date: 20,
          created: "2023-02-03T04:05:06.000Z",
          cancelled: null,
        },
      ],
    },
    {
      name: "autoGiroAgreements",
      stub: () =>
        sinon.stub(DAO.autogiroagreements, "getAgreementsByDonorId").resolves([dbAutoGiro] as any),
      call: (caller, input) => caller.minside.autoGiroAgreements(input),
      expected: [
        {
          ID: 31,
          active: false,
          amount: 250,
          KID: "000007000000033",
          payment_date: 28,
          created: "2022-03-04T05:06:07.000Z",
          cancelled: "2022-04-01T00:00:00.000Z",
        },
      ],
    },
    {
      name: "taxReports",
      stub: stubTaxReportData,
      call: (caller, input) => caller.minside.taxReports(input),
      // Compared with what REST answers (getYearlyTaxReports) below
    },
  ];

  for (const procedure of procedures) {
    describe(procedure.name, () => {
      let stub: sinon.SinonStub;
      const donor = (donorId = 7) => callerWith({ permissions: ["read:donations"], donorId });

      beforeEach(() => {
        stub = procedure.stub();
      });

      it("rejects anonymous callers", async () => {
        await expectTrpcError(procedure.call(callerWith(), { donorId: 7 }), "UNAUTHORIZED");
        expect(stub.called).to.be.false;
      });

      it("rejects another donor", async () => {
        await expectTrpcError(procedure.call(donor(), { donorId: 8 }), "FORBIDDEN");
        expect(stub.called).to.be.false;
      });

      it("rejects the donor without the read:donations permission", async () => {
        await expectTrpcError(
          procedure.call(callerWith({ permissions: ["read:profile"], donorId: 7 }), {
            donorId: 7,
          }),
          "FORBIDDEN",
        );
        expect(stub.called).to.be.false;
      });

      it("rejects ids that are not positive integers, and unknown fields", async () => {
        for (const input of [
          { donorId: 1.5 },
          { donorId: 0 },
          { donorId: -7 },
          { donorId: "7" },
          {},
          { donorId: 7, extra: true },
        ]) {
          await expectTrpcError(procedure.call(donor(), input), "BAD_REQUEST");
        }
        expect(stub.called).to.be.false;
      });

      it("returns the donor's data with only the declared fields", async () => {
        const result = await procedure.call(donor(), { donorId: 7 });
        if (procedure.expected !== undefined) {
          expect(result).to.deep.equal(procedure.expected);
        }
        expect(stub.calledOnce).to.be.true;
        expect(stub.firstCall.args[0]).to.equal(7);
      });

      it("returns any donor's data to an admin", async () => {
        const result = await procedure.call(
          callerWith({ permissions: ["read:donations", "admin"] }),
          { donorId: 7 },
        );
        expect(stub.firstCall.args[0]).to.equal(7);
        if (procedure.expected !== undefined) {
          expect(result).to.deep.equal(procedure.expected);
        }
      });

      if (procedure.name !== "taxReports") {
        it("fails as an internal error when the data doesn't match the output schema", async () => {
          stub.resolves([{ unexpected: true }]);
          await expectTrpcError(procedure.call(donor(), { donorId: 7 }), "INTERNAL_SERVER_ERROR");
        });
      }
    });
  }

  describe("taxReports", () => {
    const caller = () => callerWith({ permissions: ["read:donations"], donorId: 7 });

    it("returns what GET /donors/:id/taxreports returns", async () => {
      stubTaxReportData();
      const rest = await getYearlyTaxReports(7, RequestLocale.NO);
      const reports = await caller().minside.taxReports({ donorId: 7 });

      expect(reports).to.deep.equal(rest);
      // The previous year down to 2022
      const lastYear = new Date().getFullYear() - 1;
      expect(reports.map((r) => r.year)).to.deep.equal(
        Array.from({ length: lastYear - 2021 }, (_, i) => lastYear - i),
      );

      const report2024 = reports.find((r) => r.year === 2024)!;
      expect(report2024.units).to.have.length(1);
      expect(report2024.units[0]).to.include({
        id: 3,
        name: "Jack Torrence",
        ssn: "12345678901",
        sumDonations: 1000,
      });
      expect(report2024.units[0].channels).to.deep.equal([
        { channel: "Gi Effektivt", sumDonations: 1000 },
      ]);
      expect(report2024.sumDonationsWithoutTaxUnit.sumDonations).to.equal(300);
      expect(report2024.sumNonDeductibleDonationsByType).to.deep.equal([
        { type: "Crypto", sumNonDeductibleDonations: 300 },
      ]);
    });

    it("leaves archived tax units out", async () => {
      stubTaxReportData().resolves([
        dbTaxUnit,
        { ...dbTaxUnit, id: 4, archived: new Date("2023-01-01T00:00:00.000Z") },
      ] as any);
      const reports = await caller().minside.taxReports({ donorId: 7 });
      expect(reports.every((r) => r.units.length === 1 && r.units[0].id === 3)).to.be.true;
    });

    it("uses the NO locale by default and passes SV on", async () => {
      const taxUnits = stubTaxReportData();
      await caller().minside.taxReports({ donorId: 7 });
      await caller().minside.taxReports({ donorId: 7, locale: "SV" });
      expect(taxUnits.firstCall.args).to.deep.equal([7, "NO"]);
      expect(taxUnits.secondCall.args).to.deep.equal([7, "SV"]);
      await expectTrpcError(
        caller().minside.taxReports({ donorId: 7, locale: "DK" } as any),
        "BAD_REQUEST",
      );
    });
  });

  describe("batched over HTTP", () => {
    // A signed-in donor 7, without the Auth0 validator: the batch's authorization is under test
    const app = express();
    app.use(
      "/trpc",
      createExpressMiddleware({
        router: appRouter,
        createContext: ({ req, res }) => ({
          req,
          res,
          auth: {
            permissions: ["read:donations"],
            [String(config.authUserIdClaim)]: 7,
          },
        }),
      }),
    );

    const batchInput = (...inputs: unknown[]) =>
      encodeURIComponent(JSON.stringify(Object.fromEntries(inputs.map((v, i) => [i, v]))));

    it("answers the agreements page's three lists in one batch", async () => {
      sinon.stub(DAO.vipps, "getAgreementsByDonorId").resolves([dbVipps] as any);
      sinon.stub(DAO.avtalegiroagreements, "getByDonorId").resolves([dbAvtaleGiro] as any);
      sinon.stub(DAO.autogiroagreements, "getAgreementsByDonorId").resolves([dbAutoGiro] as any);

      const res = await request(app)
        .get(
          `/trpc/minside.vippsAgreements,minside.avtaleGiroAgreements,minside.autoGiroAgreements?batch=1&input=${batchInput(
            { donorId: 7 },
            { donorId: 7 },
            { donorId: 7 },
          )}`,
        )
        .expect(200);

      expect(res.body.map((r: any) => r.result.data[0].KID)).to.deep.equal([
        dbVipps.KID,
        dbAvtaleGiro.KID,
        dbAutoGiro.KID,
      ]);
      expect(res.body[0].result.data[0]).to.not.have.property("agreement_url_code");
    });

    it("checks each procedure of a batch against its own donor id", async () => {
      const vipps = sinon.stub(DAO.vipps, "getAgreementsByDonorId").resolves([]);
      const taxUnits = stubTaxReportData();

      const res = await request(app)
        .get(
          `/trpc/minside.vippsAgreements,minside.taxReports?batch=1&input=${batchInput(
            { donorId: 8 },
            { donorId: 7 },
          )}`,
        )
        .expect(207);

      expect(res.body[0].error.data.code).to.equal("FORBIDDEN");
      expect(res.body[1].result.data).to.be.an("array").that.is.not.empty;
      expect(vipps.called).to.be.false;
      expect(taxUnits.calledOnceWith(7, RequestLocale.NO)).to.be.true;
    });
  });
});
