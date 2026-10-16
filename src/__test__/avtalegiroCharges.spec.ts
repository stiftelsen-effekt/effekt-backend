import { expect } from "chai";
import { DateTime } from "luxon";
import {
  excludeAgreementsClaimedThisMonth,
  findChargeForPayment,
  getMonthBounds,
  MAX_DAYS_PAYMENT_AFTER_DUE_DATE,
  MAX_DAYS_PAYMENT_BEFORE_DUE_DATE,
} from "../custom_modules/avtalegiro/charges";
import { AvtaleGiroAgreement } from "../custom_modules/DAO_modules/avtalegiroagreements";

const agreement = (id: number, KID: string, paymentDate = 10): AvtaleGiroAgreement => ({
  id,
  KID,
  amount: 50000,
  paymentDate,
  notice: false,
});

const utc = (isoDate: string) => DateTime.fromISO(isoDate, { zone: "utc" });

describe("AvtaleGiro charges", () => {
  describe("getMonthBounds", () => {
    it("returns the first and last day of the month", () => {
      expect(getMonthBounds(utc("2026-10-16"))).to.deep.equal({
        start: "2026-10-01",
        end: "2026-10-31",
      });
    });

    it("handles february in leap and non-leap years", () => {
      expect(getMonthBounds(utc("2028-02-10")).end).to.equal("2028-02-29");
      expect(getMonthBounds(utc("2027-02-10")).end).to.equal("2027-02-28");
    });

    it("returns the same month when given its first or last day", () => {
      expect(getMonthBounds(utc("2026-12-01"))).to.deep.equal({
        start: "2026-12-01",
        end: "2026-12-31",
      });
      expect(getMonthBounds(utc("2026-12-31"))).to.deep.equal({
        start: "2026-12-01",
        end: "2026-12-31",
      });
    });
  });

  describe("excludeAgreementsClaimedThisMonth", () => {
    it("claims every agreement when nothing is claimed yet", () => {
      const agreements = [agreement(1, "111"), agreement(2, "222")];

      const { toClaim, alreadyClaimed } = excludeAgreementsClaimedThisMonth(agreements, new Set());

      expect(toClaim).to.deep.equal(agreements);
      expect(alreadyClaimed).to.be.empty;
    });

    it("skips agreements already claimed this month", () => {
      // KID 222 was claimed on the 5th, then the donor moved the payment date to the 10th
      const agreements = [agreement(1, "111"), agreement(2, "222"), agreement(3, "333")];

      const { toClaim, alreadyClaimed } = excludeAgreementsClaimedThisMonth(
        agreements,
        new Set(["222"]),
      );

      expect(toClaim.map((a) => a.KID)).to.deep.equal(["111", "333"]);
      expect(alreadyClaimed.map((a) => a.KID)).to.deep.equal(["222"]);
    });

    it("skips everything when all agreements are claimed", () => {
      const agreements = [agreement(1, "111"), agreement(2, "222")];

      const { toClaim, alreadyClaimed } = excludeAgreementsClaimedThisMonth(
        agreements,
        new Set(["111", "222"]),
      );

      expect(toClaim).to.be.empty;
      expect(alreadyClaimed).to.have.length(2);
    });

    it("claims a KID only once when it appears twice", () => {
      const agreements = [agreement(1, "111", 28), agreement(1, "111", 0)];

      const { toClaim, alreadyClaimed } = excludeAgreementsClaimedThisMonth(agreements, new Set());

      expect(toClaim).to.have.length(1);
      expect(alreadyClaimed).to.have.length(1);
    });

    it("ignores claimed KIDs that are not among the agreements", () => {
      const agreements = [agreement(1, "111")];

      const { toClaim } = excludeAgreementsClaimedThisMonth(agreements, new Set(["999"]));

      expect(toClaim).to.deep.equal(agreements);
    });

    it("keeps the order of the agreements", () => {
      const agreements = [agreement(3, "333"), agreement(1, "111"), agreement(2, "222")];

      const { toClaim } = excludeAgreementsClaimedThisMonth(agreements, new Set(["111"]));

      expect(toClaim.map((a) => a.id)).to.deep.equal([3, 2]);
    });
  });

  describe("findChargeForPayment", () => {
    it("returns null when there are no open charges", () => {
      expect(findChargeForPayment([], utc("2026-10-27"))).to.be.null;
    });

    it("matches a payment on the due date", () => {
      const charges = [{ id: 1, dueDate: "2026-10-27" }];

      expect(findChargeForPayment(charges, utc("2026-10-27"))).to.deep.equal(charges[0]);
    });

    it("matches a weekend due date paid on the next banking day", () => {
      // Due Saturday 24 October, charged Monday 26 October
      const charges = [{ id: 1, dueDate: "2026-10-24" }];

      expect(findChargeForPayment(charges, utc("2026-10-26"))?.id).to.equal(1);
    });

    it("matches a payment that arrives after the bank's retries", () => {
      const charges = [{ id: 1, dueDate: "2026-10-05" }];

      expect(findChargeForPayment(charges, utc("2026-10-12"))?.id).to.equal(1);
    });

    it("matches up to the window after the due date, but not beyond", () => {
      const charges = [{ id: 1, dueDate: "2026-10-01" }];
      const lastDay = utc("2026-10-01").plus({ days: MAX_DAYS_PAYMENT_AFTER_DUE_DATE });

      expect(findChargeForPayment(charges, lastDay)?.id).to.equal(1);
      expect(findChargeForPayment(charges, lastDay.plus({ days: 1 }))).to.be.null;
    });

    it("matches a few days before the due date, but not further", () => {
      const charges = [{ id: 1, dueDate: "2026-10-20" }];
      const earliest = utc("2026-10-20").minus({ days: MAX_DAYS_PAYMENT_BEFORE_DUE_DATE });

      expect(findChargeForPayment(charges, earliest)?.id).to.equal(1);
      expect(findChargeForPayment(charges, earliest.minus({ days: 1 }))).to.be.null;
    });

    it("picks the charge with the closest due date", () => {
      // Last month's charge never got a payment, this month's did
      const charges = [
        { id: 1, dueDate: "2026-09-27" },
        { id: 2, dueDate: "2026-10-27" },
      ];

      expect(findChargeForPayment(charges, utc("2026-10-27"))?.id).to.equal(2);
    });

    it("prefers the earlier due date when two are equally close", () => {
      const charges = [
        { id: 2, dueDate: "2026-10-12" },
        { id: 1, dueDate: "2026-10-08" },
      ];

      expect(findChargeForPayment(charges, utc("2026-10-10"))?.id).to.equal(1);
    });

    it("ignores charges with an invalid due date", () => {
      const charges = [
        { id: 1, dueDate: "not a date" },
        { id: 2, dueDate: "2026-10-27" },
      ];

      expect(findChargeForPayment(charges, utc("2026-10-27"))?.id).to.equal(2);
    });

    it("ignores the time of day of the payment", () => {
      const charges = [{ id: 1, dueDate: "2026-10-01" }];
      const lateOnLastDay = utc("2026-10-01")
        .plus({ days: MAX_DAYS_PAYMENT_AFTER_DUE_DATE })
        .set({ hour: 23, minute: 59 });

      expect(findChargeForPayment(charges, lateOnLastDay)?.id).to.equal(1);
    });
  });
});
