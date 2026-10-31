import { describe, it, afterEach } from "vitest";
import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import * as auth0 from "../custom_modules/auth0";
import { DAO } from "../custom_modules/DAO";
import * as taxModule from "../custom_modules/tax";
import { validateTaxUnitSsn } from "../custom_modules/donorService";
import { RequestLocale } from "../middleware/locale";
import { appRouter } from "../trpc/router";
import { sanitizeBooleanQuery, toDonorSearch } from "../trpc/routers/donors";
import { createCallerFactory } from "../trpc/trpc";

const createCaller = createCallerFactory(appRouter);

const callerWith = (permissions?: string[]) =>
  createCaller({
    req: {} as Request,
    res: {} as Response,
    auth: permissions ? { permissions } : undefined,
  });

const admin = () => callerWith(["admin"]);

const expectTrpcError = async (promise: Promise<unknown>, code: string, message?: RegExp) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
    if (message) expect(err.message).to.match(message);
  }
};

const donor = {
  id: 7,
  name: "Jack Torrence",
  email: "jack@overlookhotel.com",
  registered: "2020-01-01T00:00:00.000Z",
  newsletter: true,
  trash: false,
};

const listResult = {
  rows: [
    {
      id: 7,
      name: "Jack Torrence",
      email: "jack@overlookhotel.com",
      registered: new Date("2020-01-01"),
      lastDonation: null,
      donationsCount: 2,
      donationsSum: 300,
      newsletter: true,
    },
  ],
  pages: 1,
  statistics: { totalDonors: 1, totalDonationSum: 300, totalDonationCount: 2 },
};

const VALID_FNR = "01019010046";
const VALID_ORGNR = "910000004";

describe("tRPC donors router", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("auth and validation", () => {
    it("rejects anonymous callers", async () => {
      const stub = sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      await expectTrpcError(callerWith().donors.get({ donorId: 7 }), "UNAUTHORIZED");
      expect(stub.called).to.be.false;
    });

    it("rejects callers without the admin permission", async () => {
      const stub = sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      await expectTrpcError(
        callerWith(["read:profile"]).donors.taxUnits.list({ donorId: 7 }),
        "FORBIDDEN",
      );
      expect(stub.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      await expectTrpcError(
        admin().donors.list({ page: 0, limit: 10, filter: { fundraiserTypes: ["adoveo"] } } as any),
        "BAD_REQUEST",
      );
      await expectTrpcError(admin().donors.get({ donorId: -1 }), "BAD_REQUEST");
      await expectTrpcError(admin().donors.search({ query: "x", limit: 101 }), "BAD_REQUEST");
      expect(stub.called).to.be.false;
    });
  });

  describe("list / export / search", () => {
    it("passes the filter to getAll with dates and a null donorId", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      const result = await admin().donors.list({
        page: 2,
        limit: 25,
        sort: { id: "donationsSum", desc: false },
        filter: {
          name: "Jack",
          registered: { from: "2024-01-31" },
          donationsSum: { from: 100 },
          fundraiserGiving: "never",
          recipientOrgIDs: [1, 2],
        },
      });

      expect(result).to.deep.equal(listResult);
      const [sort, page, limit, filter] = stub.firstCall.args;
      expect(sort).to.deep.equal({ id: "donationsSum", desc: false });
      expect(page).to.equal(2);
      expect(limit).to.equal(25);
      expect(filter!.donorId).to.equal(null);
      expect(filter!.name).to.equal("Jack");
      // Whole Oslo days
      expect(filter!.registered).to.equal(undefined);
      expect(filter!.registeredRange).to.deep.equal({
        from: new Date("2024-01-30T23:00:00Z"),
        before: undefined,
      });
      expect(filter!.donationsSum).to.deep.equal({ from: 100 });
      expect(filter!.recipientOrgIDs).to.deep.equal([1, 2]);
    });

    it("treats fundraiserTypes alone as having given to such a fundraiser", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      await admin().donors.list({ page: 0, limit: 10, filter: { fundraiserTypes: ["facebook"] } });
      expect(stub.firstCall.args[3]).to.deep.include({
        fundraiserGiving: "atLeastOnce",
        fundraiserTypes: ["facebook"],
      });
      await admin().donors.list({
        page: 0,
        limit: 10,
        filter: { fundraiserTypes: ["facebook"], fundraiserGiving: "never" },
      });
      expect(stub.secondCall.args[3]).to.deep.include({ fundraiserGiving: "never" });
      await admin().donors.list({ page: 0, limit: 10, filter: {} });
      expect(stub.thirdCall.args[3]!.fundraiserGiving).to.equal(undefined);
    });

    it("matches name or email with nameOrEmail, escaping wildcards", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      await admin().donors.list({
        page: 0,
        limit: 10,
        filter: { nameOrEmail: " 50%_off ", newsletter: true },
      });
      expect(stub.firstCall.args[3]).to.deep.include({ nameOrEmail: "50%_off", newsletter: true });
      await expectTrpcError(
        admin().donors.list({ page: 0, limit: 10, filter: { nameOrEmail: "  " } }),
        "BAD_REQUEST",
      );

      stub.restore();
      const query = sinon.stub(DAO, "query").resolves([[], []] as any);
      await DAO.donors
        .getAll(
          { id: "id", desc: true },
          0,
          10,
          { donorId: null, nameOrEmail: "o'b%_\\", newsletter: true },
          "NO" as any,
        )
        .catch(() => undefined);
      const sql: string = query.firstCall.args[0];
      const pattern = "'%o\\'b\\\\%\\\\_\\\\\\\\%'";
      expect(sql).to.contain(`(Donors.full_name LIKE ${pattern} OR Donors.email LIKE ${pattern})`);
      expect(sql).to.contain("Donors.newsletter = 1");

      await DAO.donors.getAll(
        { id: "id", desc: true },
        0,
        10,
        { donorId: null, newsletter: false },
        RequestLocale.NO,
      );
      expect(query.lastCall.args[0]).to.contain(
        "(Donors.newsletter = 0 OR Donors.newsletter IS NULL)",
      );
    });

    it("returns statistics as numbers", async () => {
      sinon.stub(DAO.donors, "getAll").resolves({
        ...listResult,
        statistics: {
          totalDonors: "1",
          totalDonationSum: "300.00",
          totalDonationCount: "2",
        } as any,
      });
      const result = await admin().donors.list({ page: 0, limit: 10 });
      expect(result.statistics).to.deep.equal({
        totalDonors: 1,
        totalDonationSum: 300,
        totalDonationCount: 2,
      });
    });

    it("exports all matching donors as CSV", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      const result = await admin().donors.export({ filter: { newsletter: true } });

      expect(stub.firstCall.args[1]).to.equal(0);
      expect(stub.firstCall.args[2]).to.equal(Number.MAX_SAFE_INTEGER);
      expect(result.filename).to.match(/^donors-.*\.csv$/);
      expect(result.csv.startsWith("\uFEFF")).to.be.true;
      expect(result.csv.slice(1).split("\n")[0]).to.equal(
        "id,name,email,registered,lastDonation,donationsCount,donationsSum,newsletter",
      );
      expect(result.csv).to.contain("jack@overlookhotel.com");
    });

    it("searches with the boolean mode query and defaults", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      const result = await admin().donors.search({ query: "+jack -gmail" });

      expect(result.rows).to.have.length(1);
      const [sort, page, limit, filter] = stub.firstCall.args;
      expect(sort).to.deep.equal({ id: "id", desc: true });
      expect(page).to.equal(0);
      expect(limit).to.equal(25);
      expect(filter!.query).to.equal("+jack -gmail");
      expect(filter!.donorId).to.equal(null);
      expect(filter!.exactMatchFirst).to.equal("+jack -gmail");
    });

    it("requires all plain words, matches emails partially and ranks exact matches first", async () => {
      const stub = sinon.stub(DAO.donors, "getAll").resolves(listResult);
      await admin().donors.search({ query: " Jack Tor " });
      expect(stub.firstCall.args[3]).to.deep.include({
        query: "+Jack* +Tor*",
        exactMatchFirst: "Jack Tor",
      });

      await admin().donors.search({ query: "Jack.T_1@Overlook.com" });
      expect(stub.secondCall.args[3]).to.deep.include({
        nameOrEmail: "Jack.T_1@Overlook.com",
        query: undefined,
        exactMatchFirst: "Jack.T_1@Overlook.com",
      });

      expect(toDonorSearch("27")).to.deep.equal({ query: "27" });
      expect(toDonorSearch("@overlook")).to.deep.equal({ nameOrEmail: "@overlook" });
      expect(toDonorSearch("anne-marie hotel")).to.deep.equal({ query: "+anne* +marie* +hotel*" });
      expect(toDonorSearch('"jack torrence"')).to.deep.equal({ query: '"jack torrence"' });
      expect(toDonorSearch("jac* hotel")).to.deep.equal({ query: "jac* hotel" });
      expect(toDonorSearch("((((")).to.have.property("error");
    });

    it("orders exact id, email or name matches first in the DAO", async () => {
      const query = sinon.stub(DAO, "query").resolves([[], []] as any);
      await DAO.donors.getAll(
        { id: "id", desc: true },
        0,
        10,
        { donorId: null, query: "+jack*", exactMatchFirst: "Jack@Overlook.com" },
        RequestLocale.NO,
      );
      const sql = query.firstCall.args[0] as string;
      expect(sql).to.contain(
        "ORDER BY (LOWER(FD.email) = LOWER('Jack@Overlook.com') OR LOWER(FD.full_name) = LOWER('Jack@Overlook.com')) DESC, FD.ID DESC",
      );
    });

    it("sanitises malformed boolean mode queries", () => {
      expect(sanitizeBooleanQuery("+jack -gmail")).to.equal("+jack -gmail");
      expect(sanitizeBooleanQuery('"jack torrence" +hotel')).to.equal('"jack torrence" +hotel');
      expect(sanitizeBooleanQuery("jac*")).to.equal("jac*");
      expect(sanitizeBooleanQuery("12345")).to.equal("12345");
      expect(sanitizeBooleanQuery("+")).to.equal("");
      expect(sanitizeBooleanQuery("((((")).to.equal("");
      expect(sanitizeBooleanQuery('"jack')).to.equal("jack");
      expect(sanitizeBooleanQuery("+anne-marie")).to.equal("+anne +marie");
      expect(sanitizeBooleanQuery("jack@overlook.com")).to.equal("jack overlook.com");
      expect(sanitizeBooleanQuery("~a <b >c (d) **")).to.equal("a b c d");
    });

    it("rejects queries without search terms and maps MySQL parse errors", async () => {
      const stub = sinon.stub(DAO.donors, "getAll");
      await expectTrpcError(admin().donors.search({ query: "((((" }), "BAD_REQUEST");
      expect(stub.called).to.be.false;

      stub.rejects(Object.assign(new Error("syntax error"), { errno: 1064 }));
      await expectTrpcError(admin().donors.search({ query: "jack" }), "BAD_REQUEST");
    });
  });

  describe("donor", () => {
    it("gets a donor", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      expect(await admin().donors.get({ donorId: 7 })).to.deep.equal(donor);
    });

    it("returns trash as a boolean", async () => {
      const getByID = sinon.stub(DAO.donors, "getByID");
      getByID.onFirstCall().resolves({ ...donor, trash: null } as any);
      getByID.onSecondCall().resolves({ ...donor, trash: 1 } as any);
      expect((await admin().donors.get({ donorId: 7 })).trash).to.equal(false);
      expect((await admin().donors.get({ donorId: 7 })).trash).to.equal(true);
    });

    it("returns NOT_FOUND for a missing donor", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(null);
      await expectTrpcError(admin().donors.get({ donorId: 7 }), "NOT_FOUND");
    });

    it("creates a donor", async () => {
      sinon.stub(DAO.donors, "getIDbyEmail").resolves(null);
      const add = sinon.stub(DAO.donors, "add").resolves(7);
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);

      const created = await admin().donors.create({ email: donor.email, name: donor.name });
      expect(created).to.deep.equal(donor);
      expect(add.firstCall.args[0]).to.deep.equal({ email: donor.email, full_name: donor.name });
    });

    it("creates a donor with a tax unit when ssn is given", async () => {
      const taxUnit = { id: 11, donorId: 7, name: donor.name, ssn: "199001011239", archived: null };
      sinon.stub(DAO.donors, "getIDbyEmail").resolves(null);
      sinon.stub(DAO.donors, "add").resolves(7);
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      const addTaxUnit = sinon.stub(DAO.tax, "addTaxUnit").resolves(11);
      sinon.stub(DAO.tax, "getById").resolves(taxUnit as any);
      sinon.stub(DAO.tax, "getByDonorId").resolves([taxUnit as any]);
      sinon.stub(taxModule, "connectDonationsForFirstTaxUnit").resolves();

      await admin().donors.create({
        email: donor.email,
        name: donor.name,
        ssn: "19900101-1239",
        locale: RequestLocale.SV,
      });
      expect(addTaxUnit.firstCall.args).to.deep.equal([7, "199001011239", donor.name]);
    });

    it("rejects an invalid ssn on create before creating the donor", async () => {
      const add = sinon.stub(DAO.donors, "add").resolves(7);
      await expectTrpcError(
        admin().donors.create({ email: donor.email, name: donor.name, ssn: "01019010047" }),
        "BAD_REQUEST",
      );
      expect(add.called).to.be.false;
    });

    it("refuses to create a donor with an existing email", async () => {
      sinon.stub(DAO.donors, "getIDbyEmail").resolves(3);
      const add = sinon.stub(DAO.donors, "add");
      await expectTrpcError(
        admin().donors.create({ email: donor.email, name: donor.name }),
        "CONFLICT",
      );
      expect(add.called).to.be.false;
    });

    it("updates a donor, keeping unspecified fields", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      const update = sinon.stub(DAO.donors, "update").resolves(true);

      await admin().donors.update({ donorId: 7, name: "John", trash: true });
      expect(update.firstCall.args).to.deep.equal([7, "John", donor.email, true, true]);
    });

    it("maps a duplicate email on update to CONFLICT", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      sinon
        .stub(DAO.donors, "update")
        .rejects(Object.assign(new Error("dup"), { code: "ER_DUP_ENTRY" }));
      const lookup = sinon.stub(DAO.donors, "getIDbyEmail").resolves(12);
      await expectTrpcError(
        admin().donors.update({ donorId: 7, name: "John", email: "taken@example.com" }),
        "CONFLICT",
        /\(donor 12\)$/,
      );
      lookup.rejects(new Error("db down"));
      await expectTrpcError(
        admin().donors.update({ donorId: 7, name: "John", email: "taken@example.com" }),
        "CONFLICT",
        /another donor$/,
      );
    });

    it("names the existing donor when creating a donor with a taken email", async () => {
      sinon.stub(DAO.donors, "getIDbyEmail").resolves(12);
      const add = sinon.stub(DAO.donors, "add").resolves(7);
      await expectTrpcError(
        admin().donors.create({ email: "taken@example.com", name: "John" }),
        "CONFLICT",
        /\(donor 12\)$/,
      );
      expect(add.called).to.be.false;
    });

    it("merges donors, re-pointing Auth0 to the destination first", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      const merge = sinon.stub(DAO.donors, "mergeDonors").resolves();
      const repoint = sinon
        .stub(auth0, "repointAuth0DonorIdOnMerge")
        .resolves({ updated: [], skipped: [] });

      expect(await admin().donors.merge({ originId: 7, destinationId: 8 })).to.equal(true);
      expect(merge.firstCall.args).to.deep.equal([7, 8]);
      expect(repoint.firstCall.args).to.deep.equal([7, 8, donor.email]);
      expect(repoint.calledBefore(merge)).to.be.true;
    });

    it("still merges when re-pointing Auth0 fails", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      const merge = sinon.stub(DAO.donors, "mergeDonors").resolves();
      sinon.stub(console, "error");
      sinon.stub(auth0, "repointAuth0DonorIdOnMerge").rejects(new Error("Auth0 unavailable"));

      expect(await admin().donors.merge({ originId: 7, destinationId: 8 })).to.equal(true);
      expect(merge.calledOnce).to.be.true;
    });

    it("refuses to merge a donor into itself", async () => {
      const merge = sinon.stub(DAO.donors, "mergeDonors").resolves();
      const repoint = sinon.stub(auth0, "repointAuth0DonorIdOnMerge");
      await expectTrpcError(admin().donors.merge({ originId: 7, destinationId: 7 }), "BAD_REQUEST");
      expect(merge.called).to.be.false;
      expect(repoint.called).to.be.false;
    });

    it("returns NOT_FOUND when merging a missing donor", async () => {
      sinon
        .stub(DAO.donors, "getByID")
        .withArgs(8)
        .resolves(null)
        .withArgs(7)
        .resolves(donor as any);
      const merge = sinon.stub(DAO.donors, "mergeDonors").resolves();
      const repoint = sinon.stub(auth0, "repointAuth0DonorIdOnMerge");
      await expectTrpcError(admin().donors.merge({ originId: 7, destinationId: 8 }), "NOT_FOUND");
      expect(merge.called).to.be.false;
      expect(repoint.called).to.be.false;
    });
  });

  describe("per donor data", () => {
    it("returns donations, aggregates, referrals and agreements", async () => {
      const donations = [{ id: 1 }];
      const yearly = [
        {
          ID: 1,
          organization: "AMF",
          abbriv: "AMF",
          causeAreaID: 1,
          chartColor: null,
          value: "10",
          year: 2024,
        },
      ];
      const distributions = [
        { KID: "123", sum: "10.00", count: 1, full_name: "J", email: "j@x" },
        { KID: "124", sum: null, count: null, full_name: "J", email: "j@x" },
      ];
      const referral = {
        id: 1,
        typeId: 2,
        donorId: 7,
        timestamp: null,
        session: null,
        active: 1 as const,
        answer: "Podcast",
      };
      const avtalegiro = [{ ID: 1, amount: "500", active: 1, notice: 0 }];
      const vipps = [{ ID: "abc" }];

      sinon.stub(DAO.donations, "getByDonorId").resolves(donations as any);
      sinon.stub(DAO.donations, "getYearlyAggregateByDonorId").resolves(yearly);
      sinon.stub(DAO.distributions, "getByDonorId").resolves(distributions as any);
      sinon.stub(DAO.distributions, "getOrgSharesByKIDs").resolves(new Map());
      sinon.stub(DAO.referrals, "getDonorAnswers").resolves([referral]);
      sinon.stub(DAO.avtalegiroagreements, "getByDonorId").resolves(avtalegiro as any);
      sinon.stub(DAO.vipps, "getAgreementsByDonorId").resolves(vipps as any);

      const caller = admin();
      expect(await caller.donors.donations({ donorId: 7 })).to.deep.equal(donations);
      expect(await caller.donors.donationsAggregated({ donorId: 7 })).to.deep.equal(yearly);
      expect(await caller.donors.distributionsAggregated({ donorId: 7 })).to.deep.equal([
        { ...distributions[0], orgSplit: [] },
        { ...distributions[1], count: 0, orgSplit: [] },
      ]);
      expect(await caller.donors.referrals({ donorId: 7 })).to.deep.equal([
        { ...referral, active: true },
      ]);
      expect(await caller.donors.recurring.avtalegiro({ donorId: 7 })).to.deep.equal([
        { ID: 1, amount: 500, active: true, notice: false },
      ]);
      expect(await caller.donors.recurring.vipps({ donorId: 7 })).to.deep.equal(vipps);
    });
  });

  describe("tax units", () => {
    const taxUnit = { id: 11, donorId: 7, name: "Jack Torrence", ssn: VALID_FNR, archived: null };

    it("lists tax units with the requested locale", async () => {
      const stub = sinon.stub(DAO.tax, "getByDonorId").resolves([taxUnit as any]);
      expect(
        await admin().donors.taxUnits.list({ donorId: 7, locale: RequestLocale.SV }),
      ).to.have.length(1);
      expect(stub.firstCall.args).to.deep.equal([7, RequestLocale.SV]);
      await admin().donors.taxUnits.list({ donorId: 7 });
      expect(stub.secondCall.args).to.deep.equal([7, RequestLocale.NO]);
    });

    it("creates the first tax unit and connects donations", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves(null);
      const add = sinon.stub(DAO.tax, "addTaxUnit").resolves(11);
      sinon.stub(DAO.tax, "getById").resolves(taxUnit as any);
      sinon.stub(DAO.tax, "getByDonorId").resolves([taxUnit as any]);
      const connect = sinon.stub(taxModule, "connectDonationsForFirstTaxUnit").resolves();

      const created = await admin().donors.taxUnits.create({
        donorId: 7,
        name: "Jack Torrence",
        ssn: VALID_FNR,
      });
      expect(created).to.deep.equal(taxUnit);
      expect(add.firstCall.args).to.deep.equal([7, VALID_FNR, "Jack Torrence"]);
      expect(connect.firstCall.args).to.deep.equal([7, 11]);
    });

    it("rejects an invalid ssn before touching the database", async () => {
      const add = sinon.stub(DAO.tax, "addTaxUnit").resolves(11);
      await expectTrpcError(
        admin().donors.taxUnits.create({ donorId: 7, name: "Jack", ssn: "01019010047" }),
        "BAD_REQUEST",
      );
      expect(add.called).to.be.false;
    });

    it("refuses a duplicate ssn for the donor", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves(taxUnit as any);
      const add = sinon.stub(DAO.tax, "addTaxUnit").resolves(11);
      await expectTrpcError(
        admin().donors.taxUnits.create({ donorId: 7, name: "Jack", ssn: VALID_FNR }),
        "CONFLICT",
      );
      expect(add.called).to.be.false;
    });

    it("updates a tax unit", async () => {
      sinon.stub(DAO.tax, "getById").resolves(taxUnit as any);
      sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves(null);
      const update = sinon.stub(DAO.tax, "updateTaxUnit").resolves(1);

      const updated = await admin().donors.taxUnits.update({
        id: 11,
        name: "Overlook AS",
        ssn: VALID_ORGNR,
      });
      expect(updated).to.include({ id: 11, name: "Overlook AS", ssn: VALID_ORGNR });
      expect(update.firstCall.args[0]).to.equal(11);
      expect(update.firstCall.args[1]).to.include({ name: "Overlook AS", ssn: VALID_ORGNR });
    });

    it("refuses to update to an ssn the donor has on another tax unit", async () => {
      sinon.stub(DAO.tax, "getById").resolves(taxUnit as any);
      sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves({ ...taxUnit, id: 12 } as any);
      const update = sinon.stub(DAO.tax, "updateTaxUnit").resolves(1);
      await expectTrpcError(
        admin().donors.taxUnits.update({ id: 11, name: "Overlook AS", ssn: VALID_ORGNR }),
        "CONFLICT",
      );
      expect(update.called).to.be.false;
    });

    it("allows keeping the tax unit's own ssn on update", async () => {
      sinon.stub(DAO.tax, "getById").resolves(taxUnit as any);
      sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves(taxUnit as any);
      const update = sinon.stub(DAO.tax, "updateTaxUnit").resolves(1);
      await admin().donors.taxUnits.update({ id: 11, name: "Jack T", ssn: VALID_FNR });
      expect(update.calledOnce).to.be.true;
    });

    it("stores Swedish personnummer without the dash and checks both forms", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      const lookup = sinon.stub(DAO.tax, "getByDonorIdAndSsn").resolves(null);
      const add = sinon.stub(DAO.tax, "addTaxUnit").resolves(11);
      sinon.stub(DAO.tax, "getById").resolves(taxUnit as any);
      sinon.stub(DAO.tax, "getByDonorId").resolves([taxUnit as any, taxUnit as any]);

      await admin().donors.taxUnits.create({
        donorId: 7,
        name: "Jack",
        ssn: "19900101-1239",
        locale: RequestLocale.SV,
      });
      expect(add.firstCall.args[1]).to.equal("199001011239");
      expect(lookup.args.map((args) => args[1])).to.deep.equal(["199001011239", "19900101-1239"]);
    });

    it("returns NOT_FOUND when updating a missing tax unit", async () => {
      sinon.stub(DAO.tax, "getById").resolves(null);
      await expectTrpcError(
        admin().donors.taxUnits.update({ id: 11, name: "X", ssn: VALID_ORGNR }),
        "NOT_FOUND",
      );
    });

    it("archives a tax unit with a transfer target", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      const getById = sinon.stub(DAO.tax, "getById");
      getById.withArgs(11).resolves(taxUnit as any);
      getById.withArgs(12).resolves({ ...taxUnit, id: 12 } as any);
      const del = sinon.stub(DAO.tax, "deleteById").resolves(1);

      expect(
        await admin().donors.taxUnits.archive({ donorId: 7, taxUnitId: 11, transferId: 12 }),
      ).to.equal(true);
      expect(del.firstCall.args).to.deep.equal([11, 7, 12]);
    });

    it("refuses to archive another donor's tax unit", async () => {
      sinon.stub(DAO.donors, "getByID").resolves(donor as any);
      sinon.stub(DAO.tax, "getById").resolves({ ...taxUnit, donorId: 99 } as any);
      const del = sinon.stub(DAO.tax, "deleteById").resolves(1);
      await expectTrpcError(
        admin().donors.taxUnits.archive({ donorId: 7, taxUnitId: 11 }),
        "NOT_FOUND",
      );
      expect(del.called).to.be.false;
    });

    it("refuses a transfer target belonging to another donor", async () => {
      sinon
        .stub(DAO.tax, "getById")
        .withArgs(12)
        .resolves({ ...taxUnit, id: 12, donorId: 99 } as any);
      const del = sinon.stub(DAO.tax, "deleteById").resolves(1);
      await expectTrpcError(
        admin().donors.taxUnits.archive({ donorId: 7, taxUnitId: 11, transferId: 12 }),
        "BAD_REQUEST",
      );
      expect(del.called).to.be.false;
    });
  });

  describe("validateTaxUnitSsn", () => {
    it("accepts valid Norwegian fnr and orgnr", () => {
      expect(validateTaxUnitSsn(VALID_FNR, RequestLocale.NO)).to.equal(null);
      expect(validateTaxUnitSsn(VALID_ORGNR, RequestLocale.NO)).to.equal(null);
    });

    it("rejects invalid Norwegian numbers", () => {
      expect(validateTaxUnitSsn("01019010047", RequestLocale.NO)).to.be.a("string");
      expect(validateTaxUnitSsn("910000005", RequestLocale.NO)).to.be.a("string");
      expect(validateTaxUnitSsn("1234567890", RequestLocale.NO)).to.be.a("string");
      expect(validateTaxUnitSsn(" " + VALID_ORGNR, RequestLocale.NO)).to.be.a("string");
    });

    it("accepts valid Swedish personnummer and organisationsnummer", () => {
      expect(validateTaxUnitSsn("199001011239", RequestLocale.SV)).to.equal(null);
      expect(validateTaxUnitSsn("19900101-1239", RequestLocale.SV)).to.equal(null);
      expect(validateTaxUnitSsn("165560360793", RequestLocale.SV)).to.equal(null);
    });

    it("rejects invalid Swedish numbers", () => {
      expect(validateTaxUnitSsn("199001011238", RequestLocale.SV)).to.be.a("string");
      expect(validateTaxUnitSsn("9001011239", RequestLocale.SV)).to.be.a("string");
      expect(validateTaxUnitSsn("175560360793", RequestLocale.SV)).to.be.a("string");
      expect(validateTaxUnitSsn(VALID_FNR, RequestLocale.SV)).to.be.a("string");
    });
  });
});
