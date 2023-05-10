import { expect } from "chai";
import { generatePaymentReference } from "../custom_modules/swish";

describe("generatePaymentReference()", () => {
  it("payment reference length should be 11", () => {
    expect(generatePaymentReference().length).to.eq(11);
  });

  it("prefix should be current date", () => {
    // jest.setSystemTime(new Date("2024-05-30"));
    expect(generatePaymentReference().substring(0, 6)).to.eq("240530");
  });
});
