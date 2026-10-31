import { describe, it, beforeAll, afterAll } from "vitest";
import { DAO } from "../custom_modules/DAO";
import sinon from "sinon";
import { expect } from "chai";
import { DateTime } from "luxon";

const avtalegiro = require("../custom_modules/avtalegiro");
const config = require("../config");

/**
 * Field positions are from the AvtaleGiro systemspesifikasjon (v3.5), section 2.3
 */
describe("AvtaleGiro deletion file generation", () => {
  const deletions = [
    { KID: "002556289731589", amount: 50000, dueDate: DateTime.fromISO("2026-10-28") },
    { KID: "000638723319577", amount: 340000, dueDate: DateTime.fromISO("2026-10-27") },
  ];

  let lines: string[];
  // 1-indexed row and column, like the spec
  const field = (row: number, start: number, length: number) =>
    lines[row - 1].substr(start - 1, length);

  beforeAll(async function () {
    const donorStub = sinon.stub(DAO.donors, "getByKID");
    donorStub.withArgs("002556289731589").resolves({ name: "Maria Brækkelie" } as any);
    donorStub.withArgs("000638723319577").resolves({ name: "Kristian Jørgensen" } as any);

    config.giro_customer_id = "00230456";

    const file: Buffer = await avtalegiro.generateAvtaleGiroDeletionFile(745, deletions);
    lines = file.toString("utf-8").split("\n");
    // Pop last empty line
    lines.pop();
  });

  afterAll(function () {
    sinon.restore();
  });

  it("has a start record, one assignment of four records per deletion and an end record", () => {
    expect(lines).to.have.length(1 + deletions.length * 4 + 1);
    expect(field(1, 1, 8)).to.equal("NY000010");
    expect(field(lines.length, 1, 8)).to.equal("NY000089");
  });

  it("writes every record as 80 characters", () => {
    for (const line of lines) {
      expect(line).to.have.length(80);
    }
  });

  it("starts each assignment as a deletion request assignment", () => {
    // Oppdragstype 36, record type 20
    expect(field(2, 1, 8)).to.equal("NY213620");
    expect(field(6, 1, 8)).to.equal("NY213620");
  });

  it("numbers the assignments like payment assignments", () => {
    // Shipment 745 % 366 = 13, then the assignment number
    expect(field(2, 18, 7)).to.equal("0130000");
    expect(field(6, 18, 7)).to.equal("0130001");
  });

  it("includes the agreement account in the assignment start record", () => {
    expect(field(2, 25, 11)).to.equal("15062995960");
  });

  it("writes the original claim with transaction type 93", () => {
    // Slettepost 1: transaction type 93, record type 30
    expect(field(3, 1, 8)).to.equal("NY219330");
    // Slettepost 2: transaction type 93, record type 31
    expect(field(4, 1, 8)).to.equal("NY219331");
  });

  it("identifies the claim by due date, amount and KID", () => {
    expect(field(3, 16, 6)).to.equal("281026");
    expect(field(3, 33, 17)).to.equal("00000000000050000");
    expect(field(3, 50, 25).trim()).to.equal("002556289731589");

    expect(field(7, 16, 6)).to.equal("271026");
    expect(field(7, 33, 17)).to.equal("00000000000340000");
    expect(field(7, 50, 25).trim()).to.equal("000638723319577");
  });

  it("uses the same transaction number in both records of a deletion", () => {
    expect(field(3, 9, 7)).to.equal("0000001");
    expect(field(4, 9, 7)).to.equal("0000001");
  });

  it("ends each assignment with its count, sum and due dates", () => {
    expect(field(5, 1, 8)).to.equal("NY213688");
    // One transaction, four records including start and end
    expect(field(5, 9, 8)).to.equal("00000001");
    expect(field(5, 17, 8)).to.equal("00000004");
    expect(field(5, 25, 17)).to.equal("00000000000050000");
    expect(field(5, 42, 6)).to.equal("281026");
    expect(field(5, 48, 6)).to.equal("281026");
  });

  it("ends the shipment with totals for all deletions and the earliest due date", () => {
    const end = lines.length;
    expect(field(end, 9, 8)).to.equal("00000002");
    expect(field(end, 17, 8)).to.equal("00000010");
    expect(field(end, 25, 17)).to.equal("00000000000390000");
    expect(field(end, 42, 6)).to.equal("271026");
  });

  it("refuses to generate a file without deletions", async () => {
    let error: Error | null = null;
    try {
      await avtalegiro.generateAvtaleGiroDeletionFile(746, []);
    } catch (ex) {
      error = ex;
    }
    expect(error?.message).to.contain("without deletions");
  });
});
