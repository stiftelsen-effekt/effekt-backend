import { describe, it } from "vitest";
import { expect } from "chai";
import { StatusCodeError } from "request-promise-native/errors";
import { loggableRequestError, redactForAlert } from "../custom_modules/requestErrors";

describe("loggableRequestError", () => {
  it("drops request options with credential headers", () => {
    const ex = new StatusCodeError(
      401,
      { error: "unauthorized" },
      {
        url: "https://apitest.vipps.no",
        headers: { client_secret: "s3cret", "Ocp-Apim-Subscription-Key": "k3y" },
      },
      {} as any,
    );
    const logged = JSON.stringify(loggableRequestError(ex));
    expect(logged).to.not.include("s3cret");
    expect(logged).to.not.include("k3y");
    expect(logged).to.include("401");
  });

  it("passes other errors through", () => {
    const ex = new Error("db down");
    expect(loggableRequestError(ex)).to.equal(ex);
  });
});

describe("redactForAlert", () => {
  it("reduces request errors and drops their request options", () => {
    const ex = new StatusCodeError(
      400,
      { message: "bad due date" },
      {
        url: "https://api.vipps.no",
        headers: { Authorization: "Bearer t0k", "Ocp-Apim-Subscription-Key": "k3y" },
      },
      { toJSON: () => ({ request: { headers: { Authorization: "Bearer t0k" } } }) } as any,
    );
    const out = JSON.stringify(redactForAlert(ex));
    expect(out).to.not.include("t0k");
    expect(out).to.not.include("k3y");
    expect(out).to.include("bad due date");
    expect(out).to.include("400");
  });

  it("redacts credential-like keys at any depth, case-insensitively", () => {
    const out = JSON.stringify(
      redactForAlert({
        amount: 10000,
        agreementId: "agr_1",
        headers: { Authorization: "Bearer t0k" },
        nested: [{ "ocp-apim-subscription-key": "k3y", Client_Secret: "s3cret", keep: "ok" }],
      }),
    );
    expect(out).to.not.include("t0k");
    expect(out).to.not.include("k3y");
    expect(out).to.not.include("s3cret");
    expect(out).to.include("agr_1");
    expect(out).to.include("10000");
    expect(out).to.include('"keep":"ok"');
  });

  it("keeps the message of plain errors and survives cycles", () => {
    const data: any = { err: new Error("db down") };
    data.self = data;
    const out = JSON.stringify(redactForAlert(data));
    expect(out).to.include("db down");
    expect(out).to.include("[circular]");
  });
});
