import { describe, it, afterEach } from "vitest";
import { expect } from "chai";
import sinon from "sinon";
import request from "request-promise-native";
const vipps = require("../custom_modules/vipps");

describe("toOre", () => {
  it("converts kroner to whole øre, from numbers and decimal strings", () => {
    expect(vipps.toOre(100)).to.equal(10000);
    expect(vipps.toOre("250")).to.equal(25000);
    expect(vipps.toOre(0.29)).to.equal(29);
    expect(vipps.toOre("99.99")).to.equal(9999);
    expect(vipps.toOre(1.005)).to.be.a("number").and.satisfy(Number.isInteger);
  });

  it("rejects amounts that are not positive numbers", () => {
    for (const bad of [0, -5, NaN, "abc", ""]) {
      expect(() => vipps.toOre(bad), String(bad)).to.throw("Invalid amount");
    }
  });
});

describe("resilientPoll", () => {
  afterEach(() => sinon.restore());

  it("passes the check's answer through", async () => {
    const poll = vipps.resilientPoll("x", async () => true);
    expect(await poll(1)).to.equal(true);
  });

  it("keeps polling after an error, and stops once the time is up", async () => {
    sinon.stub(console, "error");
    const poll = vipps.resilientPoll("x", async () => {
      throw new Error("ECONNRESET");
    });
    expect(await poll(1)).to.equal(false);
    expect(await poll(100000)).to.equal(true);
  });
});

describe("captureOrder", () => {
  afterEach(() => sinon.restore());

  it("rethrows a network error instead of failing on its missing body", async () => {
    sinon.stub(console, "error");
    sinon.stub(vipps, "fetchToken").resolves({ type: "Bearer", token: "t" });
    const networkError = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    sinon.stub(request, "post").rejects(networkError);

    let caught: unknown;
    try {
      await vipps.captureOrder("123-1", { amount: 10000 });
    } catch (ex) {
      caught = ex;
    }
    expect(caught).to.equal(networkError);
  });

  it("treats Vipps error code 61 (already captured) as captured", async () => {
    sinon.stub(vipps, "fetchToken").resolves({ type: "Bearer", token: "t" });
    sinon
      .stub(request, "post")
      .rejects(Object.assign(new Error("400"), { statusCode: 400, error: [{ errorCode: 61 }] }));
    expect(await vipps.captureOrder("123-1", { amount: 10000 })).to.equal(true);
  });
});
