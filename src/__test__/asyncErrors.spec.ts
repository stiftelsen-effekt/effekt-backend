import "express-async-errors";
import bodyParser from "body-parser";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import errorHandler from "../handlers/errorHandler";
import donationsRouter from "../routes/donations";

describe("async route error handling", () => {
  it("routes a rejected async handler to the error handler instead of crashing", async () => {
    const app = express();
    app.get("/boom", async () => {
      throw new Error("boom");
    });
    app.use(errorHandler);

    const res = await request(app).get("/boom");
    expect(res.status).to.equal(500);
  });

  it("POST /donations/bank/pending with an empty body returns 400", async () => {
    const app = express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use("/donations", donationsRouter);
    app.use(errorHandler);

    await request(app).post("/donations/bank/pending").type("form").send("").expect(400);
    await request(app)
      .post("/donations/bank/pending")
      .type("form")
      .send("data=not-json")
      .expect(400);
  });
});
