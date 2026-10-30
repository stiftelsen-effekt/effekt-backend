import { describe, it } from "vitest";
import { expect } from "chai";
import { StatusCodeError } from "request-promise-native/errors";
import { loggableRequestError } from "../custom_modules/requestErrors";

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
