import { expect } from "chai";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { normalizeDonorEmail } from "../custom_modules/donorEmail";

describe("normalizeDonorEmail", function () {
  it("strips surrounding whitespace", function () {
    expect(normalizeDonorEmail("jack@overlookhotel.com ")).to.equal("jack@overlookhotel.com");
    expect(normalizeDonorEmail(" jack@overlookhotel.com")).to.equal("jack@overlookhotel.com");
    expect(normalizeDonorEmail("\tjack@overlookhotel.com\n")).to.equal("jack@overlookhotel.com");
  });

  it("leaves a clean address untouched", function () {
    expect(normalizeDonorEmail("jack@overlookhotel.com")).to.equal("jack@overlookhotel.com");
  });

  it("passes through null and undefined", function () {
    expect(normalizeDonorEmail(null)).to.equal(null);
    expect(normalizeDonorEmail(undefined)).to.equal(undefined);
  });

  /**
   * The cases below are the point of the helper being this conservative. Each of
   * these transformations merges mailboxes that can belong to different people,
   * and a donor id is all it takes to read another donor's donations and tax
   * units, so none of them may creep in later.
   */
  it("does not change case", function () {
    expect(normalizeDonorEmail("Jack@OverlookHotel.com")).to.equal("Jack@OverlookHotel.com");
  });

  it("does not strip dots from the local part", function () {
    expect(normalizeDonorEmail("j.torrance@overlookhotel.com")).to.equal(
      "j.torrance@overlookhotel.com",
    );
  });

  it("does not strip subaddress tags", function () {
    expect(normalizeDonorEmail("jack+effekt@overlookhotel.com")).to.equal(
      "jack+effekt@overlookhotel.com",
    );
  });

  it("does not touch whitespace inside a quoted local part", function () {
    expect(normalizeDonorEmail('"jack torrance"@overlookhotel.com')).to.equal(
      '"jack torrance"@overlookhotel.com',
    );
  });
});

describe("donors DAO email normalization", function () {
  /**
   * A scoped sandbox rather than the default one. Several specs in this suite
   * install stubs from module scope or from a before hook and rely on them for
   * their whole run, and a bare sinon.restore() here would tear those down.
   */
  const sandbox = sinon.createSandbox();
  let executeStub: sinon.SinonStub;
  let queryStub: sinon.SinonStub;

  beforeEach(function () {
    executeStub = sandbox.stub(DAO, "execute");
    queryStub = sandbox.stub(DAO, "query");
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("looks up donors by the trimmed address", async function () {
    executeStub.resolves([[{ ID: 237 }]]);

    const id = await DAO.donors.getIDbyEmail("jack@overlookhotel.com ");

    expect(id).to.equal(237);
    expect(executeStub.firstCall.args[1]).to.deep.equal(["jack@overlookhotel.com"]);
  });

  it("stores new donors with the trimmed address", async function () {
    queryStub.resolves([{ insertId: 237 }]);

    await DAO.donors.add({ email: " jack@overlookhotel.com ", full_name: "Jack Torrance" });

    expect(queryStub.firstCall.args[1][0]).to.equal("jack@overlookhotel.com");
  });

  it("stores updated donors with the trimmed address", async function () {
    queryStub.resolves([{ affectedRows: 1 }]);

    await DAO.donors.update(237, "Jack Torrance", "jack@overlookhotel.com ", true, false);

    expect(queryStub.firstCall.args[1][1]).to.equal("jack@overlookhotel.com");
  });
});
