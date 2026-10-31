import { describe, it, afterEach } from "vitest";
import { expect } from "chai";
import sinon from "sinon";
import * as sftp from "../custom_modules/sftp";
import * as giroSftp from "../custom_modules/giroSftp";
import { ocrFileKey, selectOCRFilesToImport } from "../custom_modules/ocrFiles";

const files = [
  { name: "b", modifyTime: 200 },
  { name: "a", modifyTime: 100 },
  { name: "c", modifyTime: 300 },
];

describe("selectOCRFilesToImport", () => {
  it("imports only the latest file until a file has been recorded", () => {
    const selected = selectOCRFilesToImport(files, { imported: new Set(), trackedSince: null });
    expect(selected.map((f) => f.name)).to.deep.equal(["c"]);
  });

  it("imports every unimported file since the first recorded one, oldest first", () => {
    const selected = selectOCRFilesToImport(files, {
      imported: new Set([ocrFileKey({ name: "a", modifyTime: 100 })]),
      trackedSince: 100,
    });
    expect(selected.map((f) => f.name)).to.deep.equal(["b", "c"]);
  });

  it("skips files older than the first recorded import", () => {
    const selected = selectOCRFilesToImport(files, {
      imported: new Set([ocrFileKey({ name: "b", modifyTime: 200 })]),
      trackedSince: 200,
    });
    expect(selected.map((f) => f.name)).to.deep.equal(["c"]);
  });

  it("treats a reused file name with a new modification time as a new file", () => {
    const selected = selectOCRFilesToImport([{ name: "a", modifyTime: 500 }], {
      imported: new Set([ocrFileKey({ name: "a", modifyTime: 100 })]),
      trackedSince: 100,
    });
    expect(selected.map((f) => f.modifyTime)).to.deep.equal([500]);
  });

  it("returns nothing when there are no files", () => {
    expect(selectOCRFilesToImport([], { imported: new Set(), trackedSince: null })).to.deep.equal(
      [],
    );
  });
});

describe("giro SFTP helpers close their connection", () => {
  afterEach(() => sinon.restore());

  const fakeConnection = () => ({
    list: sinon.stub().resolves([
      { type: "-", name: "x", modifyTime: 2 },
      { type: "d", name: "dir", modifyTime: 3 },
      { type: "-", name: "y", modifyTime: 1 },
    ]),
    get: sinon.stub().callsFake(async (path: string) => Buffer.from(path)),
    put: sinon.stub().resolves(),
    end: sinon.stub().resolves(),
  });

  it("fetches the selected files, ignoring directories", async () => {
    const conn = fakeConnection();
    sinon.stub(sftp, "getConnection").resolves(conn as any);
    let listed: string[] = [];
    const result = await giroSftp.getOCRFiles((listing) => {
      listed = listing.map((f) => f.name);
      return listing;
    });
    expect(listed).to.deep.equal(["x", "y"]);
    expect(result.map((f) => f.contents.toString())).to.deep.equal(["/Outbound/x", "/Outbound/y"]);
    expect(conn.end.calledOnce).to.equal(true);
  });

  it("closes the connection when a download fails", async () => {
    const conn = fakeConnection();
    conn.get.rejects(new Error("timeout"));
    sinon.stub(sftp, "getConnection").resolves(conn as any);
    let caught: unknown;
    try {
      await giroSftp.getOCRFiles((listing) => listing);
    } catch (ex) {
      caught = ex;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(conn.end.calledOnce).to.equal(true);
  });

  it("does not fail a sent file because closing the connection failed", async () => {
    sinon.stub(console, "error");
    const conn = fakeConnection();
    conn.end.rejects(new Error("already closed"));
    sinon.stub(sftp, "getConnection").resolves(conn as any);
    const file = Buffer.from("claims");
    expect(await giroSftp.sendFile(file, "DIRREM")).to.equal(file);
    expect(conn.put.calledOnce).to.equal(true);
  });
});
