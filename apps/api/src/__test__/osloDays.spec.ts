import { describe, it } from "vitest";
import { expect } from "chai";
import {
  dbClockColumn,
  dbClockToUtc,
  instantRangeClauses,
  osloDateOrInstantRange,
  osloDayEnd,
  osloDayRange,
  osloDayStart,
} from "../custom_modules/osloDays";

describe("osloDays", () => {
  it("turns Oslo calendar days into instants, across DST changes", () => {
    expect(osloDayStart("2024-01-01").toISOString()).to.equal("2023-12-31T23:00:00.000Z");
    expect(osloDayStart("2024-07-01").toISOString()).to.equal("2024-06-30T22:00:00.000Z");
    // 31 March 2024 is 23 hours long, 27 October 2024 is 25 hours long
    expect(osloDayEnd("2024-03-31").toISOString()).to.equal("2024-03-31T22:00:00.000Z");
    expect(osloDayEnd("2024-10-27").toISOString()).to.equal("2024-10-27T23:00:00.000Z");
    expect(() => osloDayStart("2024-02-30")).to.throw(RangeError);
  });

  it("makes inclusive day ranges half-open", () => {
    expect(osloDayRange(undefined)).to.equal(undefined);
    expect(osloDayRange({ from: "2024-10-01", to: "2024-10-31" })).to.deep.equal({
      from: new Date("2024-09-30T22:00:00Z"),
      before: new Date("2024-10-31T23:00:00Z"),
    });
    expect(osloDayRange({ to: "2024-10-31" })).to.deep.equal({
      from: undefined,
      before: new Date("2024-10-31T23:00:00Z"),
    });
  });

  it("keeps date-times as exact instants with an inclusive end", () => {
    expect(
      osloDateOrInstantRange({ from: "2024-10-01T10:00:00+02:00", to: "2024-10-31" }),
    ).to.deep.equal({
      from: new Date("2024-10-01T08:00:00Z"),
      before: new Date("2024-10-31T23:00:00Z"),
    });
    expect(osloDateOrInstantRange({ to: "2024-10-31T12:00:00Z" })!.before).to.deep.equal(
      new Date("2024-10-31T12:00:00.001Z"),
    );
  });

  it("builds clauses for app-written and MySQL-default columns", () => {
    const range = { from: new Date("2024-01-01T00:00:00Z"), before: new Date("2024-02-01Z") };
    const app = instantRangeClauses("D.timestamp_confirmed", range);
    expect(app).to.have.length(2);
    expect(app).to.deep.equal([
      "D.timestamp_confirmed >= '2024-01-01 00:00:00.000'",
      "D.timestamp_confirmed < '2024-02-01 00:00:00.000'",
    ]);
    const db = instantRangeClauses("Donors.date_registered", { from: range.from }, "db");
    expect(db).to.have.length(1);
    expect(db[0]).to.contain("TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())");
    expect(instantRangeClauses("x", undefined)).to.deep.equal([]);
  });

  it("reads DB-clock columns as UTC with the session's own zone", () => {
    expect(dbClockToUtc("PI.timestamp")).to.equal(
      "CONVERT_TZ(PI.timestamp, @@session.time_zone, '+00:00')",
    );
    // Aliased to the column's name by default, so row shapes don't change
    expect(dbClockColumn("Import_logs.timestamp")).to.equal(
      "CONVERT_TZ(Import_logs.timestamp, @@session.time_zone, '+00:00') AS timestamp",
    );
    expect(dbClockColumn("Created", "created")).to.equal(
      "CONVERT_TZ(Created, @@session.time_zone, '+00:00') AS created",
    );
  });
});
