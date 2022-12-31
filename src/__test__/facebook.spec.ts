import { roundSum } from "../custom_modules/parsers/facebook";

describe("Facebook import rounding tests", () => {
  it("Should round to within 3% error from actual sum", () => {
    roundSum(251.5).should.equal(250);
    roundSum(111.5).should.equal(110);
    roundSum(5.4).should.equal(5);
    roundSum(340123.5).should.equal(340000);
    roundSum(340123.4).should.equal(340000);
    roundSum(1000000.5).should.equal(1000000);
    roundSum(278.5).should.equal(280);
    roundSum(489.5).should.equal(500);
  });
});
