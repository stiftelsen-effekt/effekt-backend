import { describe, it, afterEach } from "vitest";
import { expect } from "chai";

// config.js is plain CommonJS, so drop it from Node's require cache to read the env again
const loadConfig = () => {
  delete require.cache[require.resolve("../config")];
  return require("../config");
};

describe("config.db_connection_limit", function () {
  const original = process.env.DB_CONNECTION_LIMIT;

  afterEach(function () {
    if (original === undefined) delete process.env.DB_CONNECTION_LIMIT;
    else process.env.DB_CONNECTION_LIMIT = original;
    loadConfig();
  });

  it("defaults to 10", function () {
    delete process.env.DB_CONNECTION_LIMIT;
    expect(loadConfig().db_connection_limit).to.equal(10);
  });

  it("reads DB_CONNECTION_LIMIT", function () {
    process.env.DB_CONNECTION_LIMIT = "4";
    expect(loadConfig().db_connection_limit).to.equal(4);
  });

  it("refuses values that are not positive integers", function () {
    for (const value of ["0", "-1", "2.5", "ten"]) {
      process.env.DB_CONNECTION_LIMIT = value;
      expect(loadConfig, value).to.throw(/DB_CONNECTION_LIMIT/);
    }
  });
});
