import { mapPureOrgSharesToDistributionInputCauseAreas } from "../custom_modules/mapping";
import sinon from "sinon";
import { DAO } from "../custom_modules/DAO";
import { expect } from "chai";
import { get } from "request";
describe("mapPureOrgSharesToDistributionInputCauseAreas", () => {
  let getByIDStub: sinon.SinonStub;

  beforeEach(() => {
    getByIDStub = sinon.stub(DAO.organizations, "getByID");
  });

  afterEach(() => {
    getByIDStub.restore();
  });

  it("should map pure org shares to distribution input cause areas", async () => {
    // Stubbing the DAO requests
    getByIDStub.resolves({ cause_area_ID: 1 });

    // Test data
    const shares = [
      { orgId: 1, percentageShare: 50 },
      { orgId: 2, percentageShare: 30 },
      { orgId: 3, percentageShare: 20 },
    ];

    // Expected result
    const expectedCauseAreas = [
      {
        id: 1,
        percentageShare: "100",
        standardSplit: false,
        organizations: [
          { id: 1, percentageShare: "50" },
          { id: 2, percentageShare: "30" },
          { id: 3, percentageShare: "20" },
        ],
      },
    ];

    // Call the function
    const result = await mapPureOrgSharesToDistributionInputCauseAreas(shares);

    // Assertions
    expect(result).to.deep.equal(expectedCauseAreas);
    expect(getByIDStub.calledThrice).to.be.true;
    expect(getByIDStub.firstCall.calledWith(1)).to.be.true;
    expect(getByIDStub.secondCall.calledWith(2)).to.be.true;
    expect(getByIDStub.thirdCall.calledWith(3)).to.be.true;
  });

  it("should map pure org shares to distribution input cause areas with multiple cause areas", async () => {
    // Stubbing the DAO requests
    getByIDStub.onCall(0).resolves({ cause_area_ID: 1 });
    getByIDStub.onCall(1).resolves({ cause_area_ID: 2 });
    getByIDStub.onCall(2).resolves({ cause_area_ID: 2 });

    // Test data
    const shares = [
      { orgId: 1, percentageShare: 50 },
      { orgId: 2, percentageShare: 30 },
      { orgId: 3, percentageShare: 20 },
    ];

    // Expected result
    const expectedCauseAreas = [
      {
        id: 1,
        percentageShare: "50",
        standardSplit: false,
        organizations: [{ id: 1, percentageShare: "100" }],
      },
      {
        id: 2,
        percentageShare: "50",
        standardSplit: false,
        organizations: [
          { id: 2, percentageShare: "60" },
          { id: 3, percentageShare: "40" },
        ],
      },
    ];

    // Call the function
    const result = await mapPureOrgSharesToDistributionInputCauseAreas(shares);

    // Assertions
    expect(result).to.deep.equal(expectedCauseAreas);
    expect(getByIDStub.calledThrice).to.be.true;
    expect(getByIDStub.firstCall.calledWith(1)).to.be.true;
    expect(getByIDStub.secondCall.calledWith(2)).to.be.true;
    expect(getByIDStub.thirdCall.calledWith(3)).to.be.true;
  });

  it("should throw an error if no shares are provided", async () => {
    // Test data
    const shares = [];

    // Call the function and expect it to throw an error
    try {
      await mapPureOrgSharesToDistributionInputCauseAreas(shares);
      throw new Error("Expected an error to be thrown");
    } catch (error) {
      expect(error.message).to.equal("No shares");
    }
  });

  it("should throw an error if shares do not add up to 100", async () => {
    // Test data
    const shares = [
      { orgId: 1, percentageShare: 50 },
      { orgId: 2, percentageShare: 30 },
    ];

    // Call the function and expect it to throw an error
    try {
      await mapPureOrgSharesToDistributionInputCauseAreas(shares);
      throw new Error("Expected an error to be thrown");
    } catch (error) {
      expect(error.message).to.equal("Shares do not add up to 100");
    }
  });

  it("should throw an error if organization is not found", async () => {
    // Stubbing the DAO requests
    getByIDStub.resolves(null);

    // Test data
    const shares = [
      { orgId: 1, percentageShare: 50 },
      { orgId: 2, percentageShare: 50 },
    ];

    // Call the function and expect it to throw an error
    try {
      await mapPureOrgSharesToDistributionInputCauseAreas(shares);
      throw new Error("Expected an error to be thrown");
    } catch (error) {
      expect(error.message).to.equal("Organization not found");
      expect(getByIDStub.calledOnceWith(1)).to.be.true;
    }
  });
});
