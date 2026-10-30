import { describe, it } from "vitest";
import { expect } from "chai";
import {
  checkAllocation,
  onwardFigures,
  prefillForwarded,
  type AllocationDraft,
  type OtherAllocation,
} from "../custom_modules/regranting/onward";
import type { OnwardLineRef } from "../custom_modules/regranting/types";

/** The worked example of docs/regranting-downstream.md: USD transfer to GiveWell at 10.50 */
const line = (overrides: Partial<OnwardLineRef> = {}): OnwardLineRef => ({
  id: 1,
  transferId: 10,
  roundId: 1,
  roundName: "Regular Q1 2025",
  payeeId: 1,
  payeeName: "GiveWell",
  intermediary: true,
  paidAt: "2025-05-20",
  transferCurrency: "USD",
  transferAmountForeign: "174285.71",
  fxRate: "10.5",
  organizationId: 3,
  organizationName: "Helen Keller International",
  projectId: 7,
  projectName: "Vitamin A Supplementation",
  amountNok: "210000.00",
  regrantingFund: false,
  ...overrides,
});

const tcf = line({
  id: 2,
  organizationId: 12,
  organizationName: "GiveWell Top Charities Fund",
  projectId: null,
  projectName: null,
  amountNok: "1200000.00",
  regrantingFund: true,
});

const draft = (overrides: Partial<AllocationDraft> = {}): AllocationDraft => ({
  kind: "grant",
  basis: "reported",
  organizationId: 3,
  externalGranteeId: null,
  projectId: 7,
  projectOrganizationId: 3,
  currency: "USD",
  amountForeign: "15000",
  amountNok: null,
  forwardedAt: "2025-07-15",
  reportId: 5,
  reportPayeeId: 1,
  note: null,
  ...overrides,
});

const other = (amountNok: string, overrides: Partial<OtherAllocation> = {}): OtherAllocation => ({
  basis: "reported",
  currency: "USD",
  amountForeign: null,
  amountNok,
  ...overrides,
});

describe("regranting onward: status of a line", () => {
  it("is awaiting with nothing entered", () => {
    expect(onwardFigures("420000.00", [])).to.deep.equal({
      reportedNok: "0.00",
      assumedNok: "0.00",
      awaitingNok: "420000.00",
      status: "awaiting",
    });
  });

  it("is partly forwarded while something awaits", () => {
    expect(onwardFigures("210000.00", [{ basis: "reported", amountNok: "157500.00" }])).to.include({
      reportedNok: "157500.00",
      awaitingNok: "52500.00",
      status: "partly_forwarded",
    });
  });

  it("is forwarded when reported covers the line", () => {
    expect(
      onwardFigures("210000.00", [
        { basis: "reported", amountNok: "157500.00" },
        { basis: "reported", amountNok: "52500.00" },
      ]).status,
    ).to.equal("forwarded");
  });

  it("is forwarded (assumed) when assumed amounts cover the rest", () => {
    expect(
      onwardFigures("210000.00", [
        { basis: "reported", amountNok: "10000.00" },
        { basis: "assumed", amountNok: "200000.00" },
      ]),
    ).to.deep.equal({
      reportedNok: "10000.00",
      assumedNok: "200000.00",
      awaitingNok: "0.00",
      status: "forwarded_assumed",
    });
  });

  it("counts retained (reported) amounts as reported", () => {
    expect(onwardFigures("100.00", [{ basis: "reported", amountNok: "100.00" }]).status).to.equal(
      "forwarded",
    );
  });
});

describe("regranting onward: validation", () => {
  it("accepts the worked example and converts USD at the transfer's rate", () => {
    const check = checkAllocation(line(), draft(), []);
    expect(check.errors).to.deep.equal([]);
    expect(check.warnings).to.deep.equal([]);
    expect(check.amountNok).to.equal("157500.00");
  });

  it("takes the remainder when the allocations come within rounding of the line", () => {
    // 114 285.71 USD × 10.5 = 1 199 999.96 kr: the line is 1 200 000.00
    const check = checkAllocation(
      tcf,
      draft({
        organizationId: 6,
        projectId: null,
        projectOrganizationId: null,
        amountForeign: "114285.71",
      }),
      [],
    );
    expect(check.amountNok).to.equal("1200000.00");
  });

  it("errors when the line isn't paid to an intermediary or isn't paid", () => {
    const check = checkAllocation(line({ intermediary: false, paidAt: null }), draft(), []);
    expect(check.errors).to.have.length(2);
    expect(check.amountNok).to.equal(null);
  });

  it("errors when the allocations would exceed the line", () => {
    const check = checkAllocation(line(), draft(), [other("100000.00")]);
    expect(check.errors.join()).to.match(/more than the line's 210\s000,00\skr/);
  });

  it("needs exactly one target for a grant", () => {
    expect(
      checkAllocation(tcf, draft({ organizationId: null, projectId: null }), []).errors.join(),
    ).to.match(/exactly one recipient or external grantee/);
    expect(
      checkAllocation(tcf, draft({ externalGranteeId: 4, projectId: null }), []).errors.join(),
    ).to.match(/exactly one/);
  });

  it("allows an external grantee on a regranting-fund line", () => {
    const check = checkAllocation(
      tcf,
      draft({
        organizationId: null,
        externalGranteeId: 4,
        projectId: null,
        projectOrganizationId: null,
      }),
      [],
    );
    expect(check.errors).to.deep.equal([]);
  });

  it("needs no target and a note for retained", () => {
    const retained = draft({
      kind: "retained",
      organizationId: null,
      projectId: null,
      projectOrganizationId: null,
      amountForeign: "10",
    });
    expect(checkAllocation(line(), retained, []).errors.join()).to.match(/Say why/);
    expect(checkAllocation(line(), { ...retained, note: "Wire fee" }, []).errors).to.deep.equal([]);
    expect(
      checkAllocation(line(), { ...retained, organizationId: 3, note: "x" }, []).errors.join(),
    ).to.match(/no recipient/);
  });

  it("errors when the project belongs to another recipient", () => {
    expect(checkAllocation(line(), draft({ projectOrganizationId: 9 }), []).errors.join()).to.match(
      /project belongs to another recipient/,
    );
  });

  it("needs a report from the same payee for reported allocations", () => {
    expect(checkAllocation(line(), draft({ reportId: null }), []).errors.join()).to.match(
      /Pick the report/,
    );
    expect(checkAllocation(line(), draft({ reportPayeeId: 2 }), []).errors.join()).to.match(
      /another payee/,
    );
  });

  it("warns, with a note required, when a pass-through line went elsewhere", () => {
    const redirected = draft({ organizationId: 6, projectId: null, projectOrganizationId: null });
    expect(checkAllocation(line(), redirected, []).errors.join()).to.match(/Explain in the note/);
    const check = checkAllocation(
      line(),
      { ...redirected, note: "HKI lost top-charity status" },
      [],
    );
    expect(check.errors).to.deep.equal([]);
    expect(check.warnings.join()).to.match(/someone other than the line's recipient/);
  });

  it("warns when forwarded before we paid and on a currency mismatch", () => {
    const check = checkAllocation(
      line(),
      draft({ forwardedAt: "2025-05-01", currency: "GBP", amountNok: "50000.00" }),
      [],
    );
    expect(check.errors).to.deep.equal([]);
    expect(check.warnings).to.have.length(2);
    expect(check.amountNok).to.equal("50000.00");
  });

  it("needs a NOK amount in another currency than the transfer's", () => {
    expect(checkAllocation(line(), draft({ currency: "GBP" }), []).errors.join()).to.match(
      /Enter the NOK amount/,
    );
  });

  it("warns when reported foreign amounts exceed the line's foreign amount", () => {
    // 20 000 USD line; 15 000 reported, 6 000 more with NOK entered within the line
    const check = checkAllocation(line(), draft({ amountForeign: "6000", amountNok: "52500.00" }), [
      other("157500.00", { amountForeign: "15000" }),
    ]);
    expect(check.errors).to.deep.equal([]);
    expect(check.warnings.join()).to.match(/USD amounts add up to 21000.00/);
  });

  it("allows assumed only on pass-through lines, to the line's recipient and project", () => {
    const assumed = draft({
      basis: "assumed",
      reportId: null,
      reportPayeeId: null,
      amountForeign: "20000",
    });
    expect(checkAllocation(line(), assumed, []).errors).to.deep.equal([]);
    expect(
      checkAllocation(
        line(),
        { ...assumed, projectId: null, projectOrganizationId: null },
        [],
      ).errors.join(),
    ).to.match(/own recipient/);
    expect(
      checkAllocation(
        tcf,
        { ...assumed, organizationId: 12, projectId: null, projectOrganizationId: null },
        [],
      ).errors.join(),
    ).to.match(/regrants by its own decision/);
  });
});

describe("regranting onward: Confirm forwarded", () => {
  it("prefills the line's recipient, project and awaiting amount in the transfer's currency", () => {
    expect(prefillForwarded(line(), "52500.00")).to.deep.equal({
      kind: "grant",
      basis: "reported",
      organizationId: 3,
      projectId: 7,
      currency: "USD",
      amountForeign: "5000.00",
      amountNok: "52500.00",
    });
  });
});
