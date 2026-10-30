import sinon from "sinon";
import { expect } from "chai";
import { DAO } from "../../custom_modules/DAO";

describe("DAO autogiroagreements", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("getAgreements includes the whole 'to' day of the created filter", async () => {
    const queryStub = sinon.stub(DAO, "query").resolves([[], []]);

    await DAO.autogiroagreements.getAgreements({ id: "id", desc: true }, 0, 10, {
      created: { from: new Date(2024, 7, 24), to: new Date(2024, 7, 24) },
    });

    const sql: string = queryStub.firstCall.args[0];
    expect(sql).to.match(/AG\.created < '2024-08-25 00:00:00/);
    expect(sql).to.not.match(/AG\.created <=/);
  });

  it("getMandates counts pages with the same filter as the rows", async () => {
    const queryStub = sinon.stub(DAO, "query");
    queryStub.onFirstCall().resolves([[{ ID: 1 }], []]);
    queryStub.onSecondCall().resolves([[{ count: 21 }], []]);

    const result = await DAO.autogiroagreements.getMandates({ id: "ID", desc: true }, 0, 10, {
      statuses: ["ACTIVE"],
    });

    expect(result.pages).to.equal(3);
    const countSql: string = queryStub.secondCall.args[0];
    expect(countSql).to.contain("AG.status IN ('ACTIVE')");
    expect(countSql).to.contain("INNER JOIN Donors");
  });
});
