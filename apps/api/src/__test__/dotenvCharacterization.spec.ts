import { afterEach, describe, it } from "vitest";
import { expect } from "chai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

/**
 * Pins how dotenv reads the API's .env files (server.ts, the test setup, prisma.config.ts), so an
 * upgrade can't change the values the API starts with or add output to its logs.
 */
const ENV_FILE = [
  "# comment",
  "PLAIN=value",
  "SPACED = spaced value  ",
  'DOUBLE="double # not a comment"',
  "SINGLE='single $NOT_EXPANDED'",
  "INLINE=inline # comment",
  "EMPTY=",
  'MULTI="line one\\nline two"',
  "export EXPORTED=yes",
  "URL=mysql://user:p%40ss@127.0.0.1:3307/db?x=1&y=2",
  'JSON={"a":1}',
  "DOTENV_CHARACTERIZATION_EXISTING=from-file",
  "",
].join("\n");

const KEYS = [
  "PLAIN",
  "SPACED",
  "DOUBLE",
  "SINGLE",
  "INLINE",
  "EMPTY",
  "MULTI",
  "EXPORTED",
  "URL",
  "JSON",
  "DOTENV_CHARACTERIZATION_EXISTING",
];

describe("dotenv characterization", () => {
  afterEach(() => sinon.restore());

  it("parses the .env syntax the API uses", () => {
    expect(dotenv.parse(ENV_FILE)).to.deep.equal({
      PLAIN: "value",
      SPACED: "spaced value",
      DOUBLE: "double # not a comment",
      SINGLE: "single $NOT_EXPANDED",
      INLINE: "inline",
      EMPTY: "",
      MULTI: "line one\nline two",
      EXPORTED: "yes",
      URL: "mysql://user:p%40ss@127.0.0.1:3307/db?x=1&y=2",
      JSON: '{"a":1}',
      DOTENV_CHARACTERIZATION_EXISTING: "from-file",
    });
  });

  it("loads a file without overriding set variables or writing output", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotenv-"));
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, ENV_FILE);
    const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    const log = sinon.stub(console, "log");
    const info = sinon.stub(console, "info");
    const error = sinon.stub(console, "error");
    const stdout = sinon.spy(process.stdout, "write");
    const stderr = sinon.spy(process.stderr, "write");
    try {
      for (const key of KEYS) delete process.env[key];
      process.env.DOTENV_CHARACTERIZATION_EXISTING = "from-env";

      const result = dotenv.config({ path: file, quiet: true });

      expect(result.error).to.equal(undefined);
      expect(process.env.PLAIN).to.equal("value");
      expect(process.env.MULTI).to.equal("line one\nline two");
      expect(process.env.DOTENV_CHARACTERIZATION_EXISTING).to.equal("from-env");
      for (const output of [log, info, error, stdout, stderr]) expect(output.called).to.be.false;
    } finally {
      sinon.restore();
      for (const key of KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an error for a missing file rather than throwing", () => {
    const result = dotenv.config({ path: "/nonexistent/.env", quiet: true });
    expect(result.error).to.be.instanceOf(Error);
  });
});
