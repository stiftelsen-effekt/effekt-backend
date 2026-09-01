import { expect } from "chai";
import { normalizeReferralCode } from "../custom_modules/referralCode";

describe("donationReferralCodes", () => {
  describe("normalizeReferralCode", () => {
    it("trims whitespace", () => {
      expect(normalizeReferralCode("  match-2026  ")).to.equal("match-2026");
    });

    it("treats empty and whitespace-only values as absent", () => {
      expect(normalizeReferralCode("")).to.be.undefined;
      expect(normalizeReferralCode("   ")).to.be.undefined;
    });

    it("ignores non-string values", () => {
      expect(normalizeReferralCode(undefined)).to.be.undefined;
      expect(normalizeReferralCode(12)).to.be.undefined;
    });
  });
});
