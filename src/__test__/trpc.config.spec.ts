import { expect } from "chai";
import type { Request, Response } from "express";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
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

const expectCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.fail(`expected ${code}`);
  } catch (err: any) {
    expect(err.code).to.equal(code);
  }
};

const causeArea = {
  id: 1,
  name: "Global health",
  shortDescription: "short",
  longDescription: "long",
  informationUrl: "https://example.org",
  isActive: true,
  ordering: 1,
  standardPercentageShare: 100,
};

const organization = (id: number, causeAreaId: number, ordering: number) => ({
  id,
  name: `Org ${id}`,
  abbreviation: `O${id}`,
  shortDescription: null,
  longDescription: "",
  standardShare: 50,
  informationUrl: null,
  isActive: true,
  ordering,
  causeAreaId,
});

const orgRow = {
  ID: 7,
  cause_area_ID: 1,
  full_name: "Against Malaria Foundation",
  abbriv: "AMF",
  short_desc: "nets",
  long_desc: "long",
  info_url: "https://amf.org",
  widget_display_name: null,
  widget_context: null,
  std_percentage_share: 40,
  is_active: 1,
  ordering: 2,
};

describe("tRPC config router", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("auth and validation", () => {
    it("rejects anonymous callers", async () => {
      const stub = sinon.stub(DAO.payment, "getMethods").resolves([]);
      await expectCode(callerWith().config.paymentMethods.list(), "UNAUTHORIZED");
      expect(stub.called).to.be.false;
    });

    it("rejects authenticated callers without the admin permission", async () => {
      const stub = sinon.stub(DAO.causeareas, "add").resolves();
      await expectCode(
        callerWith(["read:profile"]).config.causeAreas.create({ name: "X" }),
        "FORBIDDEN",
      );
      expect(stub.called).to.be.false;
    });

    it("rejects invalid input", async () => {
      const stub = sinon.stub(DAO.organizations, "add").resolves();
      await expectCode(
        admin().config.organizations.create({
          name: "X",
          abbreviation: "",
          causeAreaId: 1,
        }),
        "BAD_REQUEST",
      );
      await expectCode(
        admin().config.organizations.create({
          name: "X",
          abbreviation: "X",
          causeAreaId: 1,
          standardShare: 101,
        }),
        "BAD_REQUEST",
      );
      await expectCode(admin().config.causeAreas.toggleActive({ id: -1 }), "BAD_REQUEST");
      expect(stub.called).to.be.false;
    });
  });

  describe("causeAreas", () => {
    it("lists active cause areas with organizations", async () => {
      const data = [{ ...causeArea, organizations: [organization(1, 1, 1)] }];
      sinon.stub(DAO.causeareas, "getActiveWithOrganizations").resolves(data);
      expect(await admin().config.causeAreas.listActive()).to.deep.equal(data);
    });

    it("lists all cause areas with their organizations", async () => {
      sinon
        .stub(DAO.causeareas, "getAll")
        .resolves([causeArea, { ...causeArea, id: 2, isActive: false }]);
      sinon
        .stub(DAO.organizations, "getAll")
        .resolves([organization(1, 1, 1), organization(2, 2, 1), organization(3, 1, 2)]);
      const result = await admin().config.causeAreas.listAll();
      expect(result.map((c) => c.organizations.map((o) => o.id))).to.deep.equal([[1, 3], [2]]);
    });

    it("creates a cause area with REST defaults", async () => {
      const add = sinon.stub(DAO.causeareas, "add").resolves();
      await admin().config.causeAreas.create({ name: "Animals" });
      expect(add.firstCall.args[0]).to.deep.equal({
        name: "Animals",
        shortDescription: "",
        longDescription: "",
        informationUrl: "",
        isActive: true,
        ordering: 99,
        standardPercentageShare: 0,
      });
    });

    it("updates only the given fields", async () => {
      sinon.stub(DAO.causeareas, "getById").resolves(causeArea);
      const update = sinon.stub(DAO.causeareas, "updateById").resolves();
      await admin().config.causeAreas.update({ id: 1, standardPercentageShare: 60 });
      expect(update.firstCall.args[0]).to.deep.equal({ ...causeArea, standardPercentageShare: 60 });
    });

    it("maps a missing cause area to NOT_FOUND", async () => {
      sinon.stub(DAO.causeareas, "getById").rejects(new Error("Cause area not found"));
      const update = sinon.stub(DAO.causeareas, "updateById").resolves();
      await expectCode(admin().config.causeAreas.update({ id: 9, name: "X" }), "NOT_FOUND");
      expect(update.called).to.be.false;
    });

    it("toggles active", async () => {
      const getById = sinon.stub(DAO.causeareas, "getById");
      getById.onFirstCall().resolves(causeArea);
      getById.onSecondCall().resolves({ ...causeArea, isActive: false });
      const update = sinon.stub(DAO.causeareas, "updateById").resolves();
      const result = await admin().config.causeAreas.toggleActive({ id: 1 });
      expect(update.firstCall.args[0].isActive).to.equal(false);
      expect(result.isActive).to.equal(false);
    });
  });

  describe("organizations", () => {
    it("lists active and all organizations", async () => {
      sinon.stub(DAO.organizations, "getActive").resolves([organization(1, 1, 1)]);
      sinon.stub(DAO.organizations, "getAll").resolves([organization(2, 1, 1)]);
      expect((await admin().config.organizations.listActive())[0].id).to.equal(1);
      expect((await admin().config.organizations.listAll())[0].id).to.equal(2);
    });

    it("lists organizations of a cause area sorted by ordering", async () => {
      sinon
        .stub(DAO.organizations, "getAll")
        .resolves([organization(1, 1, 3), organization(2, 2, 1), organization(3, 1, 1)]);
      const result = await admin().config.organizations.listByCauseArea({ causeAreaId: 1 });
      expect(result.map((o) => o.id)).to.deep.equal([3, 1]);
    });

    it("creates an organization with REST defaults", async () => {
      const add = sinon.stub(DAO.organizations, "add").resolves();
      await admin().config.organizations.create({ name: "GD", abbreviation: "GD", causeAreaId: 1 });
      expect(add.firstCall.args[0]).to.deep.equal({
        name: "GD",
        abbreviation: "GD",
        shortDescription: "",
        longDescription: "",
        informationUrl: "",
        isActive: true,
        ordering: 99,
        standardShare: 0,
        causeAreaId: 1,
      });
    });

    it("updates an organization and returns it mapped", async () => {
      sinon.stub(DAO.organizations, "getByID").resolves(orgRow);
      const update = sinon.stub(DAO.organizations, "updateById").resolves();
      const result = await admin().config.organizations.update({ id: 7, standardShare: 60 });
      expect(update.firstCall.args[0]).to.deep.equal({
        id: 7,
        name: "Against Malaria Foundation",
        abbreviation: "AMF",
        shortDescription: "nets",
        longDescription: "long",
        informationUrl: "https://amf.org",
        isActive: true,
        ordering: 2,
        standardShare: 60,
        causeAreaId: 1,
      });
      expect(result.abbreviation).to.equal("AMF");
    });

    it("toggles active and 404s on missing organizations", async () => {
      const getByID = sinon.stub(DAO.organizations, "getByID");
      getByID.withArgs(7).resolves(orgRow);
      getByID.withArgs(8).resolves(null);
      const update = sinon.stub(DAO.organizations, "updateById").resolves();
      await admin().config.organizations.toggleActive({ id: 7 });
      expect(update.firstCall.args[0].isActive).to.equal(false);
      await expectCode(admin().config.organizations.toggleActive({ id: 8 }), "NOT_FOUND");
      expect(update.calledOnce).to.be.true;
    });
  });

  describe("referralTypes", () => {
    const type = { id: 3, name: "Podcast", ordering: 2, is_active: 1 as const };

    it("lists active and all referral types", async () => {
      sinon.stub(DAO.referrals, "getTypes").resolves([{ id: 3, name: "Podcast", ordering: 2 }]);
      sinon.stub(DAO.referrals, "getAllTypes").resolves([type]);
      expect(await admin().config.referralTypes.listActive()).to.have.length(1);
      expect(await admin().config.referralTypes.listAll()).to.deep.equal([type]);
    });

    it("creates a referral type", async () => {
      const create = sinon
        .stub(DAO.referrals, "createType")
        .resolves({ id: 4, name: "Radio", ordering: 5, is_active: true });
      const result = await admin().config.referralTypes.create({ name: "Radio", ordering: 5 });
      expect(create.firstCall.args).to.deep.equal(["Radio", 5]);
      expect(result.id).to.equal(4);
    });

    it("updates a referral type", async () => {
      const update = sinon.stub(DAO.referrals, "updateType").resolves(true);
      sinon.stub(DAO.referrals, "getTypeById").resolves(type);
      const result = await admin().config.referralTypes.update({ id: 3, isActive: false });
      expect(update.firstCall.args).to.deep.equal([
        3,
        { name: undefined, ordering: undefined, is_active: false },
      ]);
      expect(result).to.deep.equal(type);
    });

    it("rejects empty updates and 404s on missing types", async () => {
      const update = sinon.stub(DAO.referrals, "updateType").resolves(false);
      await expectCode(admin().config.referralTypes.update({ id: 3 }), "BAD_REQUEST");
      expect(update.called).to.be.false;
      await expectCode(admin().config.referralTypes.update({ id: 3, name: "X" }), "NOT_FOUND");
    });

    it("toggles active", async () => {
      sinon.stub(DAO.referrals, "toggleTypeActive").resolves(true);
      sinon.stub(DAO.referrals, "getTypeById").resolves({ ...type, is_active: 0 });
      const result = await admin().config.referralTypes.toggleActive({ id: 3 });
      expect(result.is_active).to.equal(0);
    });
  });

  describe("paymentMethods", () => {
    it("lists payment methods, empty list when none", async () => {
      const getMethods = sinon.stub(DAO.payment, "getMethods");
      getMethods.onFirstCall().resolves(null);
      expect(await admin().config.paymentMethods.list()).to.deep.equal([]);
    });
  });
});
