import sinon from "sinon";
import { expect } from "chai";
import { DateTime } from "luxon";
import { DAO } from "../../custom_modules/DAO";
import { query } from "express";

describe("DAO Distributions", () => {
  describe("getAll", () => {
    it("Gets all distributions with no filter", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "123456789",
          sum: 100,
          count: 2,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 2,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(0, 10, { id: "ID" }, null);

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 1,
      });
      expect(queryStub.firstCall.args[0]).to.not.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with filter", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "123456789",
          sum: 100,
          count: 2,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 2,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(
        0,
        10,
        { id: "ID" },
        { donor: "Test Testesen" },
      );

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 1,
      });
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("Test Testesen");
      expect(queryStub.firstCall.args[0]).to.contain("LIKE");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with filter and order", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "123456789",
          sum: 100,
          count: 2,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 2,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(
        0,
        10,
        { id: "sum", desc: true },
        { donor: "Test Testesen" },
      );

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 1,
      });
      expect(queryStub.firstCall.args[0]).to.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("Test Testesen");
      expect(queryStub.firstCall.args[0]).to.contain("LIKE");
      expect(queryStub.firstCall.args[0]).to.contain("ORDER BY sum DESC");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 10");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    it("Gets all distributions with correct pages counter when there are more rows than the limit", async () => {
      const queryStub = sinon.stub(DAO, "query");

      const mockQueryResponse = [
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Glor Gorgesen Testesen",
          email: "asd@test.com",
        },
        {
          KID: "987654321",
          sum: 200,
          count: 1,
          full_name: "Test Testesen",
          email: "testæøå@test.com",
        },
      ];

      const mockCountQueryResponse = [
        {
          count: 3,
        },
      ];

      queryStub.onFirstCall().resolves([mockQueryResponse, []]);
      queryStub.onSecondCall().resolves([mockCountQueryResponse, []]);

      const result = await DAO.distributions.getAll(0, 1, { id: "ID" }, null);

      expect(queryStub.calledTwice).to.be.true;
      expect(result).to.deep.equal({
        rows: mockQueryResponse,
        pages: 3,
      });
      expect(queryStub.firstCall.args[0]).to.not.contain("WHERE");
      expect(queryStub.firstCall.args[0]).to.contain("LIMIT 1");
      expect(queryStub.firstCall.args[0]).to.contain("OFFSET 0");
    });

    afterEach(() => {
      sinon.restore();
    });
  });
});
