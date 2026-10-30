import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import { DAO } from "../custom_modules/DAO";
import { fundraisersRouter } from "../routes/fundraisers";

describe("GET /fundraisers/dashboard/:secret", () => {
  afterEach(() => sinon.restore());

  it("HTML-escapes donor-supplied names and messages", async () => {
    sinon.stub(DAO.fundraisers, "getFundraiserTransactionsBySecret").resolves([
      {
        id: 1,
        message: "<img src=x onerror=alert(document.domain)>",
        name: "<b>x</b>",
        amount: 100,
        date: new Date("2026-01-01"),
        donorName: "Donor",
        donorEmail: "donor@example.test",
      },
    ] as any);

    const app = express();
    app.use("/fundraisers", fundraisersRouter);
    const res = await request(app).get("/fundraisers/dashboard/secret").expect(200);

    expect(res.text).to.not.include("<img");
    expect(res.text).to.not.include("<b>x</b>");
    expect(res.text).to.include("&lt;img src=x onerror=alert(document.domain)&gt;");
    expect(res.headers["content-security-policy"]).to.include("default-src 'none'");
  });
});
