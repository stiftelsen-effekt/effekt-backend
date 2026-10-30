import { describe, it } from "vitest";
import "express-async-errors";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import errorHandler from "../handlers/errorHandler";

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
});
