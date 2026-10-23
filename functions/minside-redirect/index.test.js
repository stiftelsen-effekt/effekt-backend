const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { getTestServer } = require("@google-cloud/functions-framework/testing");

const functions = require("@google-cloud/functions-framework");
functions.http("prod", require("./index").prod);

let server;
let base;

before(async () => {
  server = getTestServer("prod");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const get = (path) => fetch(base + path, { redirect: "manual" });
const TARGET = "https://data.gieffektivt.no/vipps/agreement/minside/";

test("redirects a single path segment with 302", async () => {
  const res = await get("/abc123");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `${TARGET}abc123`);
});

test("passes the query string through unchanged", async () => {
  const res = await get("/abc123?foo=bar&baz=1");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `${TARGET}abc123?foo=bar&baz=1`);
});

test("returns 404 for the bare root", async () => {
  const res = await get("/");
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "Not found");
});

test("returns 404 for more than one path segment (as before)", async () => {
  assert.equal((await get("/abc/def")).status, 404);
  assert.equal((await get("/abc/")).status, 404);
});

test("redirects a query-only root, as the 2023 version did", async () => {
  const res = await get("/?foo=bar");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `${TARGET}?foo=bar`);
});
