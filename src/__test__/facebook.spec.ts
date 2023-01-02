import { expect } from "chai";
import { roundSum } from "../custom_modules/parsers/facebook";

describe("Facebook import rounding tests", () => {
  it("Should round to within 5.1% error from actual sum", () => {
    // Testing 3% error margin rounding with random numbers gradually increasing in order of magnitude
    expect(roundSum(10.2)).to.equal(10);
    expect(roundSum(47.5)).to.equal(50);
    expect(roundSum(87)).to.equal(90);
    expect(roundSum(103.2)).to.equal(100);
    expect(roundSum(134.2)).to.equal(130);
    expect(roundSum(251.2)).to.equal(250);
    expect(roundSum(289.2)).to.equal(300);
    expect(roundSum(934.2)).to.equal(900);
    expect(roundSum(1020.2)).to.equal(1000);
  });
});
