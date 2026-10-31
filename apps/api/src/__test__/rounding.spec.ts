import { describe, it } from "vitest";
import { expect } from "chai";

const round = require("../custom_modules/rounding");

describe("round", function () {
  describe("sumWithPrecision", function () {
    const positiveTestCases = [
      [50, 50],
      [10, 12, 14, 16, 18, 20, 10],
      [0.002, 99.998],
      [33.33333333, 33.33333333, 33.33333334],
      [21.2, 12.4, 8.7, 9.326, 8.1, 12.7863144, 8, 10, 9.4876856],
      [100],
      [0, 0, 0, 100],
    ];

    const negativeTestCases = [
      [10, 20],
      [99.99998, 0.00001],
      [2, 2, 2, 2, 1, 90],
      [6.6000000000000005, 6.6000000000000005, 6.6000000000000005, 80, 0.2, 0, 0],
    ];

    it("should be a function", function () {
      expect(round.sumWithPrecision).to.be.a("function");
    });

    it("should return a string", function () {
      expect(round.sumWithPrecision([50, 50])).to.be.a("string");
    });

    it("should return 100 when supplied with array that totals 100", function () {
      for (let i = 0; i < positiveTestCases.length; i++) {
        let res = round.sumWithPrecision(positiveTestCases[i]);
        expect(res).to.equal("100");
      }
    });

    it("should not return 100 when supplied with array that does not total 100", function () {
      for (let i = 0; i < negativeTestCases.length; i++) {
        expect(round.sumWithPrecision(negativeTestCases[i]).toString()).to.not.equal("100");
      }
    });
  });
});
