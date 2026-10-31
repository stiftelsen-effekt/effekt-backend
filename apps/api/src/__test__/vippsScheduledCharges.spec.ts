import { describe, it, afterEach, expect as vexpect } from "vitest";
import { expect } from "chai";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
const vipps = require("../custom_modules/vipps");

// Local dates, like the scheduler. "now" is 01:50 on the given day.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 1, 50);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("scheduledChargeDueDate", () => {
  const longAgo = "2020-01-01T00:00:00Z";

  it("charges on the regular day, three days ahead", () => {
    const due = vipps.scheduledChargeDueDate({ monthly_charge_day: 15 }, at(2026, 11, 12));
    expect(due?.getTime()).to.equal(day(2026, 11, 15).getTime());
  });

  it("treats charge day 0 as the last day of the month", () => {
    expect(vipps.scheduledChargeDueDate({ monthly_charge_day: 0 }, at(2026, 11, 27))).to.not.equal(
      null,
    );
    expect(vipps.scheduledChargeDueDate({ monthly_charge_day: 0 }, at(2026, 11, 26))).to.equal(
      null,
    );
  });

  it("catches up a charge day missed in the last three days for an existing agreement", () => {
    const agreement = { monthly_charge_day: 15, timestamp_created: longAgo };
    // Should have been created on the 12th; the job did not run until the 14th
    const due = vipps.scheduledChargeDueDate(agreement, at(2026, 11, 14));
    expect(due?.getTime()).to.equal(day(2026, 11, 17).getTime());
    // Too late to catch up
    expect(vipps.scheduledChargeDueDate(agreement, at(2026, 11, 16))).to.equal(null);
  });

  it("does not charge a new agreement before its first regular run", () => {
    const agreement = { monthly_charge_day: 15, timestamp_created: "2026-11-13T10:00:00" };
    expect(vipps.scheduledChargeDueDate(agreement, at(2026, 11, 14))).to.equal(null);
    expect(vipps.scheduledChargeDueDate({ monthly_charge_day: 15 }, at(2026, 11, 14))).to.equal(
      null,
    );
  });

  it("charges on (or catches up) a force charge date", () => {
    const agreement = { monthly_charge_day: 1, force_charge_date: "2026-11-20" };
    expect(vipps.scheduledChargeDueDate(agreement, at(2026, 11, 17))).to.not.equal(null);
    expect(vipps.scheduledChargeDueDate(agreement, at(2026, 11, 19))).to.not.equal(null);
    expect(vipps.scheduledChargeDueDate(agreement, at(2026, 11, 16))).to.equal(null);
    expect(vipps.scheduledChargeDueDate(agreement, at(2026, 11, 21))).to.equal(null);
  });
});

describe("scheduledChargeIdempotencyKey", () => {
  it("is stable per agreement and due date", () => {
    const key = vipps.scheduledChargeIdempotencyKey("agr_1", "2026-11-15");
    expect(key).to.match(/^[0-9a-f]{32}$/);
    expect(vipps.scheduledChargeIdempotencyKey("agr_1", "2026-11-15")).to.equal(key);
    expect(vipps.scheduledChargeIdempotencyKey("agr_1", "2026-12-15")).to.not.equal(key);
    expect(vipps.scheduledChargeIdempotencyKey("agr_2", "2026-11-15")).to.not.equal(key);
  });
});

describe("hasChargedDueMonth", () => {
  afterEach(() => sinon.restore());
  const due = day(2026, 11, 15);

  it("counts charges that are still pending or due, not only charged ones", async () => {
    for (const status of ["PENDING", "DUE", "RESERVED", "PROCESSING", "CHARGED"]) {
      sinon.restore();
      sinon.stub(vipps, "getCharges").resolves([{ due: "2026-11-15", status }]);
      expect(await vipps.hasChargedDueMonth("agr_1", due), status).to.equal(true);
    }
  });

  it("leaves the month open after a failed or cancelled charge, or one in another month", async () => {
    sinon.stub(vipps, "getCharges").resolves([
      { due: "2026-11-01", status: "FAILED" },
      { due: "2026-11-02", status: "CANCELLED" },
      { due: "2026-10-15", status: "CHARGED" },
    ]);
    expect(await vipps.hasChargedDueMonth("agr_1", due)).to.equal(false);
  });

  it("throws when the charges cannot be fetched", async () => {
    sinon.stub(vipps, "getCharges").resolves(false);
    await vexpect(vipps.hasChargedDueMonth("agr_1", due)).rejects.toThrow();
  });
});

describe("createFutureDueCharges", () => {
  afterEach(() => sinon.restore());
  const now = at(2026, 11, 12);
  const agreement = (ID: string) => ({ ID, monthly_charge_day: 15, paused_until_date: null });
  const vippsAgreement = (id: string) => ({ id, status: "ACTIVE", pricing: { amount: 30000 } });

  it("continues past failing agreements, counts only created charges and reports failures", async () => {
    sinon.stub(console, "error");
    sinon.stub(console, "log");
    sinon
      .stub(DAO.vipps, "getActiveAgreements")
      .resolves([agreement("agr_1"), agreement("agr_2"), agreement("agr_3")] as any);
    const getAgreement = sinon.stub(vipps, "getAgreement");
    getAgreement.withArgs("agr_1").rejects(new Error("network"));
    getAgreement.withArgs("agr_2").resolves(vippsAgreement("agr_2"));
    getAgreement.withArgs("agr_3").resolves(vippsAgreement("agr_3"));
    sinon.stub(vipps, "hasChargedDueMonth").resolves(false);
    const createCharge = sinon.stub(vipps, "createCharge");
    createCharge.withArgs("agr_2").resolves(false);
    createCharge.withArgs("agr_3").resolves("chr_3");

    const result = await vipps.createFutureDueCharges(now);

    expect(result.activeAgreements).to.equal(3);
    expect(result.createdCharges).to.equal(1);
    expect(result.failed.map((f) => f.agreementId)).to.deep.equal(["agr_1", "agr_2"]);

    const [, amount, , dueDate, key] = createCharge.withArgs("agr_3").firstCall.args;
    expect(amount).to.equal(300);
    expect(dueDate.getTime()).to.equal(day(2026, 11, 15).getTime());
    expect(key).to.equal(vipps.scheduledChargeIdempotencyKey("agr_3", "2026-11-15"));
  });

  it("does not create a second charge when the month already has a pending one", async () => {
    sinon.stub(DAO.vipps, "getActiveAgreements").resolves([agreement("agr_1")] as any);
    sinon.stub(vipps, "getAgreement").resolves(vippsAgreement("agr_1"));
    sinon.stub(vipps, "getCharges").resolves([{ due: "2026-11-15", status: "PENDING" }]);
    const createCharge = sinon.stub(vipps, "createCharge");

    const result = await vipps.createFutureDueCharges(now);

    expect(createCharge.called).to.equal(false);
    expect(result.failed).to.deep.equal([]);
  });
});

describe("synchronizeVippsAgreementDatabase", () => {
  afterEach(() => sinon.restore());

  it("continues past a failing agreement and reports it", async () => {
    sinon.stub(console, "error");
    const getAgreements = sinon.stub(vipps, "getAgreements").resolves([]);
    getAgreements.withArgs("ACTIVE").resolves([
      { id: "agr_1", status: "ACTIVE", pricing: { amount: 10000 } },
      { id: "agr_2", status: "ACTIVE", pricing: { amount: 10000 } },
    ]);
    getAgreements.withArgs("EXPIRED").resolves(false);
    sinon.stub(DAO.vipps, "addAgreement").resolves(true);
    sinon.stub(DAO.vipps, "updateAgreementPrice").resolves(true);
    sinon.stub(DAO.vipps, "updateAgreementStatus").resolves(true);
    sinon.stub(DAO.vipps, "getAgreement").resolves({ KID: "123" } as any);
    const getCharges = sinon.stub(vipps, "getCharges");
    getCharges.withArgs("agr_1").resolves(false);
    getCharges.withArgs("agr_2").resolves([]);

    const result = await vipps.synchronizeVippsAgreementDatabase();

    expect(result.agreements).to.equal(2);
    expect(getCharges.calledWith("agr_2")).to.equal(true);
    expect(result.failed).to.deep.equal([
      { status: "EXPIRED", error: "Could not fetch EXPIRED agreements" },
      { agreementId: "agr_1", error: "Could not fetch charges" },
    ]);
  });
});
