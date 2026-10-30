import { describe, it } from "vitest";
import { expect } from "chai";
import { DateTime } from "luxon";
import {
  canRequestDeletion,
  canSendDeletion,
  getDeletionDeadline,
  getEffectiveDueDate,
  isBankingDay,
  partitionChargesForDeletion,
} from "../custom_modules/avtalegiro/charges";

const oslo = (iso: string) => DateTime.fromISO(iso, { zone: "Europe/Oslo" });
const deadline = (dueDate: string) => getDeletionDeadline(oslo(dueDate)).toISO();

describe("AvtaleGiro deletion deadlines", () => {
  describe("isBankingDay", () => {
    it("treats weekdays as banking days", () => {
      expect(isBankingDay(oslo("2026-10-16"))).to.be.true;
    });

    it("treats weekends and holidays as non-banking days", () => {
      expect(isBankingDay(oslo("2026-10-24"))).to.be.false;
      expect(isBankingDay(oslo("2026-10-25"))).to.be.false;
      expect(isBankingDay(oslo("2026-04-03"))).to.be.false; // Good Friday
      expect(isBankingDay(oslo("2026-12-25"))).to.be.false;
    });
  });

  describe("getEffectiveDueDate", () => {
    it("keeps a due date on a banking day", () => {
      expect(getEffectiveDueDate(oslo("2026-10-27")).toISODate()).to.equal("2026-10-27");
    });

    it("moves a weekend due date to the next banking day", () => {
      expect(getEffectiveDueDate(oslo("2026-10-24")).toISODate()).to.equal("2026-10-26");
      expect(getEffectiveDueDate(oslo("2026-10-25")).toISODate()).to.equal("2026-10-26");
    });

    it("moves a due date past the easter holidays", () => {
      expect(getEffectiveDueDate(oslo("2026-04-03")).toISODate()).to.equal("2026-04-07");
    });

    it("reads the calendar day regardless of the time zone it is given in", () => {
      const utcMidnight = DateTime.fromISO("2026-10-24", { zone: "utc" });
      expect(getEffectiveDueDate(utcMidnight).toISODate()).to.equal("2026-10-26");
    });
  });

  describe("getDeletionDeadline", () => {
    it("is 14:00 on the banking day before the due date", () => {
      // Due Tuesday 27 October
      expect(deadline("2026-10-27")).to.equal("2026-10-26T14:00:00.000+01:00");
    });

    it("is the friday before for a monday due date", () => {
      expect(deadline("2026-10-26")).to.equal("2026-10-23T14:00:00.000+02:00");
    });

    it("is the banking day before the next banking day for a weekend due date", () => {
      // Due Saturday 24 October, charged Monday 26 October
      expect(deadline("2026-10-24")).to.equal("2026-10-23T14:00:00.000+02:00");
    });

    it("skips the easter holidays", () => {
      // Due Tuesday 7 April 2026, after Maundy Thursday to Easter Monday
      expect(deadline("2026-04-07")).to.equal("2026-04-01T14:00:00.000+02:00");
      // Due Good Friday, charged Tuesday 7 April
      expect(deadline("2026-04-03")).to.equal("2026-04-01T14:00:00.000+02:00");
    });

    it("skips christmas", () => {
      // Due Monday 28 December 2026, after Christmas Day and the weekend
      expect(deadline("2026-12-28")).to.equal("2026-12-24T14:00:00.000+01:00");
    });

    it("skips Constitution Day", () => {
      // Due Tuesday 18 May 2027, with Monday 17 May a holiday
      expect(deadline("2027-05-18")).to.equal("2027-05-14T14:00:00.000+02:00");
    });
  });

  describe("canRequestDeletion", () => {
    it("allows cancellations before the last run on the deadline day", () => {
      expect(canRequestDeletion("2026-10-27", oslo("2026-10-26T12:59"))).to.be.true;
      expect(canRequestDeletion("2026-10-27", oslo("2026-10-20T08:00"))).to.be.true;
    });

    it("refuses cancellations from the last run on the deadline day", () => {
      expect(canRequestDeletion("2026-10-27", oslo("2026-10-26T13:00"))).to.be.false;
      expect(canRequestDeletion("2026-10-27", oslo("2026-10-26T16:00"))).to.be.false;
    });

    it("refuses cancellations on the due date and after", () => {
      expect(canRequestDeletion("2026-10-27", oslo("2026-10-27T08:00"))).to.be.false;
      expect(canRequestDeletion("2026-10-27", oslo("2026-10-29T08:00"))).to.be.false;
    });

    it("refuses cancellations over the weekend before a monday due date", () => {
      expect(canRequestDeletion("2026-10-26", oslo("2026-10-24T10:00"))).to.be.false;
    });

    it("compares in Oslo time across the end of daylight saving time", () => {
      // Clocks went back on 25 October, so 13:00 in Oslo on the 26th is 12:00 UTC
      const utc = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });
      expect(canRequestDeletion("2026-10-27", utc("2026-10-26T11:59:00Z"))).to.be.true;
      expect(canRequestDeletion("2026-10-27", utc("2026-10-26T12:00:00Z"))).to.be.false;
    });
  });

  describe("canSendDeletion", () => {
    it("sends until shortly before the 14:00 deadline", () => {
      expect(canSendDeletion("2026-10-27", oslo("2026-10-26T13:00"))).to.be.true;
      expect(canSendDeletion("2026-10-27", oslo("2026-10-26T13:44"))).to.be.true;
      expect(canSendDeletion("2026-10-27", oslo("2026-10-26T13:45"))).to.be.false;
    });

    it("lets the last run send a cancellation made just before it", () => {
      const cancelledAt = oslo("2026-10-26T12:59");
      const lastRun = oslo("2026-10-26T13:00:05");

      expect(canRequestDeletion("2026-10-27", cancelledAt)).to.be.true;
      expect(canSendDeletion("2026-10-27", lastRun)).to.be.true;
    });
  });

  describe("partitionChargesForDeletion", () => {
    it("splits charges into those we can still delete and those too late", () => {
      const charges = [
        { id: 1, dueDate: "2026-10-27" },
        { id: 2, dueDate: "2026-10-23" },
        { id: 3, dueDate: "2026-11-27" },
      ];

      const { deletable, tooLate } = partitionChargesForDeletion(charges, oslo("2026-10-22T15:00"));

      expect(deletable.map((charge) => charge.id)).to.deep.equal([1, 3]);
      expect(tooLate.map((charge) => charge.id)).to.deep.equal([2]);
    });

    it("returns nothing for no charges", () => {
      expect(partitionChargesForDeletion([], oslo("2026-10-22T15:00"))).to.deep.equal({
        deletable: [],
        tooLate: [],
      });
    });
  });
});
