import sinon from "sinon";
import { expect } from "chai";
import { DateTime } from "luxon";
import { DAO } from "../../custom_modules/DAO";
import { avtalegirocharges } from "../../custom_modules/DAO_modules/avtalegirocharges";

describe("DAO avtalegirocharges", () => {
  let queryStub: sinon.SinonStub;

  beforeEach(() => {
    queryStub = sinon.stub(DAO, "query");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("addCharges", () => {
    it("inserts one claimed row per agreement", async () => {
      queryStub.resolves([{ affectedRows: 2 }, []]);

      await avtalegirocharges.addCharges(
        42,
        [
          { id: 1, KID: "111", amount: 50000, paymentDate: 27, notice: true },
          { id: 2, KID: "222", amount: 340000, paymentDate: 27, notice: false },
        ],
        DateTime.fromISO("2026-10-27"),
      );

      expect(queryStub.calledOnce).to.be.true;
      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.contain("INSERT INTO Avtalegiro_agreement_charges");
      const [rows] = params;
      expect(rows.map((row) => row.slice(0, 6))).to.deep.equal([
        [1, 42, "111", "2026-10-27", 50000, "CLAIMED"],
        [2, 42, "222", "2026-10-27", 340000, "CLAIMED"],
      ]);
      // created and last_updated are written from the app (UTC), not by the column default
      expect(sql).to.contain("created, last_updated");
      for (const row of rows) {
        expect(row[6]).to.be.instanceOf(Date);
        expect(row[7]).to.equal(row[6]);
      }
    });

    it("does nothing without agreements", async () => {
      await avtalegirocharges.addCharges(42, [], DateTime.fromISO("2026-10-27"));

      expect(queryStub.called).to.be.false;
    });
  });

  describe("getClaimedKIDsForMonth", () => {
    it("queries the whole month and counts only claimed and completed charges", async () => {
      queryStub.resolves([[{ KID: "111" }, { KID: "222" }], []]);

      const claimed = await avtalegirocharges.getClaimedKIDsForMonth(
        DateTime.fromISO("2026-10-27"),
      );

      expect(claimed).to.deep.equal(new Set(["111", "222"]));
      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.contain("due_date BETWEEN ? AND ?");
      expect(params).to.deep.equal(["2026-10-01", "2026-10-31", ["CLAIMED", "COMPLETED"]]);
    });

    it("returns an empty set when nothing is claimed", async () => {
      queryStub.resolves([[], []]);

      const claimed = await avtalegirocharges.getClaimedKIDsForMonth(
        DateTime.fromISO("2026-02-10"),
      );

      expect(claimed.size).to.equal(0);
      expect(queryStub.firstCall.args[1]).to.deep.equal([
        "2026-02-01",
        "2026-02-28",
        ["CLAIMED", "COMPLETED"],
      ]);
    });
  });

  describe("getShipmentIDsForDueDate", () => {
    it("finds today's shipments for the due date", async () => {
      queryStub.resolves([[{ shipmentID: 650 }, { shipmentID: 651 }], []]);

      const shipmentIDs = await avtalegirocharges.getShipmentIDsForDueDate(
        DateTime.fromISO("2026-10-24"),
        DateTime.fromISO("2026-10-20T11:00:00"),
      );

      expect(shipmentIDs).to.deep.equal([650, 651]);
      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.contain("DATE(S.generated) = ?");
      expect(params).to.deep.equal(["2026-10-24", "2026-10-20", "SUPERSEDED"]);
    });
  });

  describe("getUntrackedShipmentIDs", () => {
    it("finds the day's shipments sent before the first recorded charge", async () => {
      queryStub.resolves([[{ ID: 640 }, { ID: 641 }], []]);

      const shipmentIDs = await avtalegirocharges.getUntrackedShipmentIDs(
        DateTime.fromISO("2026-10-20T11:00:00"),
      );

      expect(shipmentIDs).to.deep.equal([640, 641]);
      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.contain("NOT EXISTS");
      expect(sql).to.contain("MIN(shipmentID)");
      expect(params).to.deep.equal(["2026-10-20"]);
    });
  });

  describe("supersedeShipments", () => {
    it("marks the claimed charges in the shipments as superseded", async () => {
      queryStub.resolves([{ affectedRows: 3 }, []]);

      await avtalegirocharges.supersedeShipments([650, 651]);

      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.contain("UPDATE Avtalegiro_agreement_charges SET status = ?");
      expect(params).to.deep.equal(["SUPERSEDED", [650, 651], "CLAIMED"]);
    });

    it("does nothing without shipments", async () => {
      await avtalegirocharges.supersedeShipments([]);

      expect(queryStub.called).to.be.false;
    });
  });

  describe("getOpenChargesByKID", () => {
    it("maps claimed charges without a payment", async () => {
      queryStub.resolves([
        [
          { ID: 7, due_date: "2026-09-27" },
          { ID: 9, due_date: "2026-10-27" },
        ],
        [],
      ]);

      const charges = await avtalegirocharges.getOpenChargesByKID("111");

      expect(charges).to.deep.equal([
        { id: 7, dueDate: "2026-09-27" },
        { id: 9, dueDate: "2026-10-27" },
      ]);
      const [sql, params] = queryStub.firstCall.args;
      expect(sql).to.contain("donationID IS NULL");
      expect(params).to.deep.equal(["111", "CLAIMED"]);
    });
  });

  describe("markCompleted", () => {
    it("links the donation and completes the charge", async () => {
      queryStub.resolves([{ affectedRows: 1 }, []]);

      const updated = await avtalegirocharges.markCompleted(9, 1234);

      expect(updated).to.be.true;
      expect(queryStub.firstCall.args[1]).to.deep.equal(["COMPLETED", 1234, 9, "CLAIMED"]);
    });

    it("reports when the charge was already completed", async () => {
      queryStub.resolves([{ affectedRows: 0 }, []]);

      expect(await avtalegirocharges.markCompleted(9, 1234)).to.be.false;
    });
  });
});
