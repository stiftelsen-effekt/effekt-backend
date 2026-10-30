import { expect } from "chai";
import sinon from "sinon";
import { getFundraiserRedirectUrl } from "../custom_modules/fundraiserRedirect";

const config = require("../config");

describe("getFundraiserRedirectUrl", () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(config, "revalidate_token").value("tok3n");
    fetchStub = sinon.stub(globalThis, "fetch");
  });
  afterEach(() => sinon.restore());

  it("revalidates server-side and returns the fundraiser page URL without the token", async () => {
    fetchStub.resolves(
      new Response(null, {
        status: 307,
        headers: { location: "/innsamling/my-page?plausible=abc" },
      }),
    );

    const url = await getFundraiserRedirectUrl(12, "abc", "https://gieffektivt.no/fallback");

    expect(url).to.equal("https://gieffektivt.no/innsamling/my-page?plausible=abc");
    expect(url).to.not.include("tok3n");
    const calledUrl: string = fetchStub.firstCall.args[0];
    expect(calledUrl).to.include(
      "/api/fundraiser/redirect?fundraiserId=12&secret=tok3n&plausible=abc",
    );
    expect(fetchStub.firstCall.args[1].redirect).to.equal("manual");
  });

  it("falls back when revalidation fails", async () => {
    fetchStub.resolves(new Response("Invalid token", { status: 401 }));
    expect(await getFundraiserRedirectUrl(12, "abc", "https://gieffektivt.no/fallback")).to.equal(
      "https://gieffektivt.no/fallback",
    );

    fetchStub.rejects(new Error("network"));
    expect(await getFundraiserRedirectUrl(12, "abc", "https://gieffektivt.no/fallback")).to.equal(
      "https://gieffektivt.no/fallback",
    );
  });

  it("does not redirect to other origins", async () => {
    fetchStub.resolves(
      new Response(null, { status: 307, headers: { location: "https://evil.example/x" } }),
    );
    expect(await getFundraiserRedirectUrl(12, "abc", "https://gieffektivt.no/fallback")).to.equal(
      "https://gieffektivt.no/fallback",
    );
  });
});
