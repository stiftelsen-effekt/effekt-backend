import { describe, it, afterEach } from "vitest";
import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";

describe("DAO writes report failures", () => {
  afterEach(() => sinon.restore());

  it("addAgreement returns false when the insert fails", async () => {
    sinon.stub(console, "error");
    sinon.stub(DAO, "query").rejects(new Error("db down"));
    const result = await DAO.vipps.addAgreement("agr_1", 1, "123", 100, 5, "code");
    expect(result).to.equal(false);
  });

  it("addCharge returns false when the insert fails", async () => {
    sinon.stub(console, "error");
    sinon.stub(DAO, "query").rejects(new Error("db down"));
    const result = await DAO.vipps.addCharge(
      "chr_1",
      "agr_1",
      100,
      "123",
      "2026-11-01",
      "DUE",
      "RECURRING",
    );
    expect(result).to.equal(false);
  });

  it("addAgreement waits for the insert before reporting success", async () => {
    let resolved = false;
    sinon.stub(DAO, "query").callsFake(async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
      return [{ affectedRows: 1 }, []] as any;
    });
    const result = await DAO.vipps.addAgreement("agr_1", 1, "123", 100, 5, "code");
    expect(result).to.equal(true);
    expect(resolved).to.equal(true);
  });

  it("vipps updates return whether a row matched", async () => {
    const query = sinon.stub(DAO, "query");
    query.onCall(0).resolves([{ affectedRows: 1 }, []] as any);
    query.onCall(1).resolves([{ affectedRows: 0 }, []] as any);
    expect(await DAO.vipps.updateAgreementStatus("agr_1", "ACTIVE")).to.equal(true);
    expect(await DAO.vipps.updateChargeStatus("CHARGED", "agr_1", "chr_missing")).to.equal(false);
  });

  it("vipps updates return false when the query fails", async () => {
    sinon.stub(console, "error");
    sinon.stub(DAO, "query").rejects(new Error("db down"));
    expect(await DAO.vipps.updateAgreementPrice("agr_1", 200)).to.equal(false);
    expect(await DAO.vipps.updateAgreementKID("agr_1", "123")).to.equal(false);
  });

  it("avtalegiro cancelAgreement propagates failures instead of reporting success", async () => {
    sinon.stub(DAO, "query").rejects(new Error("db down"));
    let caught: unknown;
    try {
      await DAO.avtalegiroagreements.cancelAgreement("123");
    } catch (ex) {
      caught = ex;
    }
    expect(caught).to.be.instanceOf(Error);
  });
});

describe("DAO transactions release their connection", () => {
  const originalPool = (DAO as any).dbPool;
  afterEach(() => {
    sinon.restore();
    (DAO as any).dbPool = originalPool;
  });

  const fakeConnection = (failOn?: string) => {
    const query = sinon.stub().callsFake(async (sql: string) => {
      if (sql === failOn) throw new Error(`${sql} failed`);
      return [[], []];
    });
    return { query, release: sinon.spy() };
  };

  it("releases and rolls back when COMMIT fails, and a later rollback is a no-op", async () => {
    sinon.stub(console, "log");
    const conn = fakeConnection("COMMIT");
    let caught: unknown;
    try {
      await DAO.commitTransaction(conn);
    } catch (ex) {
      caught = ex;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(conn.query.calledWith("ROLLBACK")).to.equal(true);
    expect(conn.release.calledOnce).to.equal(true);

    await DAO.rollbackTransaction(conn);
    expect(conn.release.calledOnce).to.equal(true);
    expect(conn.query.withArgs("ROLLBACK").callCount).to.equal(1);
  });

  it("releases when ROLLBACK fails", async () => {
    sinon.stub(console, "log");
    const conn = fakeConnection("ROLLBACK");
    let caught: unknown;
    try {
      await DAO.rollbackTransaction(conn);
    } catch (ex) {
      caught = ex;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(conn.release.calledOnce).to.equal(true);
  });

  it("releases after a successful commit", async () => {
    const conn = fakeConnection();
    await DAO.commitTransaction(conn);
    expect(conn.release.calledOnce).to.equal(true);
  });

  it("releases the connection when START TRANSACTION fails", async () => {
    sinon.stub(console, "log");
    const conn = fakeConnection("START TRANSACTION");
    (DAO as any).dbPool = { getConnection: async () => conn };
    let caught: unknown;
    try {
      await DAO.startTransaction();
    } catch (ex) {
      caught = ex;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(conn.release.calledOnce).to.equal(true);
  });
});
