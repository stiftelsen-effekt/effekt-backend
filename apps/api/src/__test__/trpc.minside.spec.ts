import { describe, it, beforeEach, afterEach } from "vitest";
import { expect } from "chai";
import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { mountTrpc } from "../trpc/express";
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

const theDonor = () => callerWith({ permissions: ["read:donations"], donorId: 7 });

type Caller = ReturnType<typeof callerWith>;

const expectTrpcError = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const dbDonor = {
  id: 7,
  name: "Jack Torrence",
  email: "jack@overlookhotel.com",
  registered: new Date("2020-01-01T00:00:00.000Z"),
  newsletter: true,
  trash: 0,
};

describe("tRPC minside router", () => {
  let getByID: sinon.SinonStub;

  beforeEach(() => {
    getByID = sinon.stub(DAO.donors, "getByID").resolves(dbDonor as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("profile", () => {
    it("rejects anonymous callers", async () => {
      await expectTrpcError(callerWith().minside.profile({ donorId: 7 }), "UNAUTHORIZED");
      expect(getByID.called).to.be.false;
    });

    it("rejects another donor", async () => {
      await expectTrpcError(theDonor().minside.profile({ donorId: 8 }), "FORBIDDEN");
      expect(getByID.called).to.be.false;
    });

    it("rejects the donor without the read:donations permission", async () => {
      await expectTrpcError(
        callerWith({ permissions: ["read:profile"], donorId: 7 }).minside.profile({ donorId: 7 }),
        "FORBIDDEN",
      );
      expect(getByID.called).to.be.false;
    });

    it("rejects ids that are not positive integers", async () => {
      for (const donorId of [1.5, 0, -7, "7", "1.2e4"]) {
        await expectTrpcError(theDonor().minside.profile({ donorId } as any), "BAD_REQUEST");
      }
      expect(getByID.called).to.be.false;
    });

    it("returns the profile to the donor, with only the declared fields", async () => {
      const profile = await theDonor().minside.profile({ donorId: 7 });
      expect(profile).to.deep.equal({
        id: 7,
        name: "Jack Torrence",
        email: "jack@overlookhotel.com",
        newsletter: true,
        registered: "2020-01-01T00:00:00.000Z",
      });
      expect(getByID.calledOnceWith(7)).to.be.true;
    });

    it("returns any donor's profile to an admin", async () => {
      const profile = await callerWith({
        permissions: ["read:donations", "admin"],
      }).minside.profile({ donorId: 7 });
      expect(profile.id).to.equal(7);
    });

    it("answers NOT_FOUND for a missing donor", async () => {
      getByID.resolves(null);
      await expectTrpcError(theDonor().minside.profile({ donorId: 7 }), "NOT_FOUND");
    });
  });

  describe("read-only Min Side procedures", () => {
    const dbTaxUnit = {
      id: 3,
      donorId: 7,
      name: "Jack Torrence",
      ssn: "12345678901",
      registered: new Date("2021-02-03T04:05:06.000Z"),
      archived: null,
      sumDonations: "1500",
      numDonations: 2,
      taxDeductions: [{ year: 2021, sumDonations: 1500, deduction: 1500, benefit: 330 }],
    };
    const dbAggregate = {
      ID: 12,
      organization: "Against Malaria Foundation",
      abbriv: "AMF",
      causeAreaID: 1,
      chartColor: "chart-1",
      value: "750.000000",
      year: 2023,
    };
    const dbDonation = {
      id: 101,
      donor: "Jack Torrence",
      donorId: 7,
      email: "jack@overlookhotel.com",
      sum: "1000.00",
      transactionCost: "2.00",
      timestamp: new Date("2023-05-06T07:08:09.000Z"),
      paymentMethod: "Bank",
      KID: "000007000000017",
      taxUnitId: 3,
      metaOwnerId: 3,
    };
    const distribution = (kid: string) => ({
      kid,
      donorId: 7,
      taxUnitId: 3,
      fundraiserTransactionId: undefined,
      causeAreas: [
        {
          id: 1,
          name: "Global health",
          percentageShare: "100.000000000000000",
          standardSplit: false,
          organizations: [
            {
              id: 6,
              name: "Against Malaria Foundation",
              widgetDisplayName: undefined,
              percentageShare: "100.000000000000000",
            },
          ],
        },
      ],
    });

    /** Each procedure: the REST route's permission, its DAO stub and what it returns */
    const procedures: {
      name: string;
      permission: string;
      stub: () => sinon.SinonStub;
      call: (caller: Caller, input: any) => Promise<unknown>;
      expected: unknown;
    }[] = [
      {
        name: "taxUnits",
        permission: "read:profile",
        stub: () => sinon.stub(DAO.tax, "getByDonorId").resolves([dbTaxUnit] as any),
        call: (caller, input) => caller.minside.taxUnits(input),
        expected: [{ ...dbTaxUnit, registered: "2021-02-03T04:05:06.000Z" }],
      },
      {
        name: "donationsAggregated",
        permission: "read:donations",
        stub: () =>
          sinon.stub(DAO.donations, "getYearlyAggregateByDonorId").resolves([dbAggregate] as any),
        call: (caller, input) => caller.minside.donationsAggregated(input),
        // ID, causeAreaID and chartColor are not declared (Min Side doesn't use them)
        expected: [
          {
            organization: "Against Malaria Foundation",
            abbriv: "AMF",
            value: "750.000000",
            year: 2023,
          },
        ],
      },
      {
        name: "donations",
        permission: "read:donations",
        stub: () => sinon.stub(DAO.donations, "getByDonorId").resolves([dbDonation] as any),
        call: (caller, input) => caller.minside.donations(input),
        expected: [{ ...dbDonation, timestamp: "2023-05-06T07:08:09.000Z" }],
      },
      {
        name: "distributions",
        permission: "read:donations",
        stub: () =>
          sinon
            .stub(DAO.distributions, "getAllByDonor")
            .resolves({ donorID: 7, distributions: [distribution("111")] } as any),
        call: (caller, input) => caller.minside.distributions(input),
        // fundraiserTransactionId and widgetDisplayName are not declared
        expected: [
          {
            kid: "111",
            donorId: 7,
            taxUnitId: 3,
            causeAreas: [
              {
                id: 1,
                name: "Global health",
                percentageShare: "100.000000000000000",
                standardSplit: false,
                organizations: [
                  {
                    id: 6,
                    name: "Against Malaria Foundation",
                    percentageShare: "100.000000000000000",
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    for (const procedure of procedures) {
      describe(procedure.name, () => {
        let stub: sinon.SinonStub;
        const donor = (donorId = 7) => callerWith({ permissions: [procedure.permission], donorId });

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

        it(`rejects the donor without the ${procedure.permission} permission`, async () => {
          const other = procedure.permission === "read:profile" ? "read:donations" : "read:profile";
          await expectTrpcError(
            procedure.call(callerWith({ permissions: [other], donorId: 7 }), { donorId: 7 }),
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
          expect(await procedure.call(donor(), { donorId: 7 })).to.deep.equal(procedure.expected);
          expect(stub.calledOnce).to.be.true;
          expect(stub.firstCall.args[0]).to.equal(7);
        });

        it("returns any donor's data to an admin", async () => {
          const result = await procedure.call(
            callerWith({ permissions: [procedure.permission, "admin"] }),
            { donorId: 7 },
          );
          expect(result).to.deep.equal(procedure.expected);
        });

        it("fails as an internal error when the data doesn't match the output schema", async () => {
          stub.resolves(
            procedure.name === "distributions"
              ? { donorID: 7, distributions: [{ kid: 1 }] }
              : [{ unexpected: true }],
          );
          await expectTrpcError(procedure.call(donor(), { donorId: 7 }), "INTERNAL_SERVER_ERROR");
        });
      });
    }

    it("taxUnits uses the NO locale by default and passes SV on", async () => {
      const stub = sinon.stub(DAO.tax, "getByDonorId").resolves([]);
      const caller = callerWith({ permissions: ["read:profile"], donorId: 7 });
      await caller.minside.taxUnits({ donorId: 7 });
      await caller.minside.taxUnits({ donorId: 7, locale: "SV" });
      expect(stub.firstCall.args).to.deep.equal([7, "NO"]);
      expect(stub.secondCall.args).to.deep.equal([7, "SV"]);
      await expectTrpcError(
        caller.minside.taxUnits({ donorId: 7, locale: "DK" } as any),
        "BAD_REQUEST",
      );
    });

    it("distributions returns only the given KIDs when kids is set", async () => {
      sinon.stub(DAO.distributions, "getAllByDonor").resolves({
        donorID: 7,
        distributions: [distribution("111"), distribution("222"), distribution("333")],
      } as any);
      const caller = theDonor();
      const kids = async (input: { kids?: string[] }) =>
        (await caller.minside.distributions({ donorId: 7, ...input })).map((d) => d.kid);

      expect(await kids({})).to.deep.equal(["111", "222", "333"]);
      expect(await kids({ kids: ["333", "111", "999"] })).to.deep.equal(["111", "333"]);
      expect(await kids({ kids: [] })).to.deep.equal([]);
      await expectTrpcError(
        caller.minside.distributions({ donorId: 7, kids: [""] }),
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
            permissions: ["read:donations", "read:profile"],
            [String(config.authUserIdClaim)]: 7,
          },
        }),
      }),
    );

    const batchInput = (...inputs: unknown[]) =>
      encodeURIComponent(JSON.stringify(Object.fromEntries(inputs.map((v, i) => [i, v]))));

    it("checks each procedure of a batch against its own donor id", async () => {
      const donations = sinon.stub(DAO.donations, "getByDonorId").resolves([]);
      const taxUnits = sinon.stub(DAO.tax, "getByDonorId").resolves([]);

      const res = await request(app)
        .get(
          `/trpc/minside.donations,minside.taxUnits?batch=1&input=${batchInput(
            { donorId: 7 },
            { donorId: 8 },
          )}`,
        )
        .expect(207);

      expect(res.body[0].result.data).to.deep.equal([]);
      expect(res.body[1].error.data.code).to.equal("FORBIDDEN");
      expect(donations.calledOnceWith(7)).to.be.true;
      expect(taxUnits.called).to.be.false;
    });

    it("rejects the other donor's id in either position of a batch", async () => {
      const donations = sinon.stub(DAO.donations, "getByDonorId").resolves([]);

      const res = await request(app)
        .get(
          `/trpc/minside.donations,minside.donations?batch=1&input=${batchInput(
            { donorId: 8 },
            { donorId: 7 },
          )}`,
        )
        .expect(207);

      expect(res.body[0].error.data.code).to.equal("FORBIDDEN");
      expect(res.body[1].result.data).to.deep.equal([]);
      expect(donations.calledOnceWith(7)).to.be.true;
    });
  });

  describe("over HTTP", () => {
    const app = express();
    app.use(express.json());
    mountTrpc(app);

    const input = (value: unknown) => encodeURIComponent(JSON.stringify(value));

    it("answers 401 without a token", async () => {
      const res = await request(app)
        .get(`/trpc/minside.profile?input=${input({ donorId: 7 })}`)
        .expect(401);
      expect(res.body.error.data.code).to.equal("UNAUTHORIZED");
    });

    it("answers 401 with an invalid token", async () => {
      await request(app)
        .get(`/trpc/minside.profile?input=${input({ donorId: 7 })}`)
        .set("Authorization", "Bearer not.a.token")
        .expect(401);
    });
  });

  it("keeps the shared schemas free of backend imports (apps/web bundles them)", () => {
    const source = readFileSync(join(__dirname, "../trpc/shared/minside.ts"), "utf8");
    const imports = [...source.matchAll(/(?:from|import|require\()\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(imports).to.deep.equal(["zod"]);
  });
});
