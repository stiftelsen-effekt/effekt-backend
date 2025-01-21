import { expect } from "chai";
import { parseSwedishSSN } from "../custom_modules/ssn";

describe("Swedish SSN Parser", () => {
  const currentYear = 2025;

  it("should parse a full SSN with dash correctly", () => {
    const result = parseSwedishSSN("19811216-0059", currentYear);
    expect(result.isValid).to.be.true;
    expect(result.fullYear).to.equal(1981);
    expect(result.month).to.equal("12");
    expect(result.day).to.equal("16");
    expect(result.serialNumber).to.equal("0059");
  });

  it("should parse a short SSN with dash correctly", () => {
    const result = parseSwedishSSN("811216-0059", currentYear);
    expect(result.isValid).to.be.true;
    expect(result.fullYear).to.equal(1981);
    expect(result.month).to.equal("12");
    expect(result.day).to.equal("16");
    expect(result.serialNumber).to.equal("0059");
  });

  it("should handle plus sign for people over 100 years old", () => {
    const result = parseSwedishSSN("231216+0059", currentYear);
    expect(result.isValid).to.be.true;
    expect(result.fullYear).to.equal(1923);
  });

  it("should reject plus sign for people under 100 years old", () => {
    const result = parseSwedishSSN("19811216+0059", currentYear);
    expect(result.isValid).to.be.false;
  });

  it("should reject dash for people over 100 years old", () => {
    const result = parseSwedishSSN("19231216-0059", currentYear);
    expect(result.isValid).to.be.false;
  });

  it("should handle short format year threshold correctly", () => {
    // Should be interpreted as 2012 (not 1912)
    const result1 = parseSwedishSSN("121216-0059", currentYear);
    expect(result1.isValid).to.be.true;
    expect(result1.fullYear).to.equal(2012);

    // Should be interpreted as 1989 (not 2089)
    const result2 = parseSwedishSSN("891216-0059", currentYear);
    expect(result2.isValid).to.be.true;
    expect(result2.fullYear).to.equal(1989);
  });

  it("should reject invalid dates", () => {
    expect(parseSwedishSSN("19811332-0059", currentYear).isValid).to.be.false; // Invalid month
    expect(parseSwedishSSN("19811231-0059", currentYear).isValid).to.be.true; // Valid date
    expect(parseSwedishSSN("19811200-0059", currentYear).isValid).to.be.false; // Invalid day
  });

  it("should return formatted SSN without separator", () => {
    const result = parseSwedishSSN("19811216-0059", currentYear);
    expect(result.formatted).to.equal("198112160059");

    const result2 = parseSwedishSSN("811216-0059", currentYear);
    expect(result2.formatted).to.equal("198112160059");

    const result3 = parseSwedishSSN("231216+0059", currentYear);
    expect(result3.formatted).to.equal("192312160059");
  });

  it("should handle SSNs without separator", () => {
    const result1 = parseSwedishSSN("198112160059", currentYear);
    expect(result1.isValid).to.be.true;
    expect(result1.fullYear).to.equal(1981);
    expect(result1.formatted).to.equal("198112160059");

    const result2 = parseSwedishSSN("8112160059", currentYear);
    expect(result2.isValid).to.be.true;
    expect(result2.fullYear).to.equal(1981);
    expect(result2.formatted).to.equal("198112160059");

    // Should interpret as 2012 since it's within the 100-year window
    const result3 = parseSwedishSSN("1212160059", currentYear);
    expect(result3.isValid).to.be.true;
    expect(result3.fullYear).to.equal(2012);
    expect(result3.formatted).to.equal("201212160059");
  });

  it("should reject malformed input", () => {
    expect(parseSwedishSSN("invalid", currentYear).isValid).to.be.false;
    expect(parseSwedishSSN("1981121-0059", currentYear).isValid).to.be.false; // Wrong format
    expect(parseSwedishSSN("19811216005", currentYear).isValid).to.be.false; // Too short
    expect(parseSwedishSSN("1981121600599", currentYear).isValid).to.be.false; // Too long
  });
});
