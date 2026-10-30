import { expect } from "chai";
import { dec, ZERO } from "../custom_modules/regranting/money";
import type { ProposedPosition } from "../custom_modules/regranting/proposal";
import type { FundGrant, RoundDonation, Transfer } from "../custom_modules/regranting/types";
import {
  hasErrors,
  paymentProblem,
  validateRound,
  type ValidationInput,
} from "../custom_modules/regranting/validation";

const AGF = 1;
const MC = 3;
const FUND = 4;
const FUND2 = 5;
const GD = 6;
const NOPAYEE = 7;
const MOMS = 61;

const position = (
  organizationId: number,
  projectId: number | null,
  values: Partial<
    Record<"balanceAtCutoff" | "committed" | "fundGrants" | "roundAdjustments" | "inRound", number>
  > = {},
): ProposedPosition => {
  const balanceAtCutoff = dec(values.balanceAtCutoff ?? 0);
  const committed = dec(values.committed ?? 0);
  const fundGrants = dec(values.fundGrants ?? 0);
  const roundAdjustments = dec(values.roundAdjustments ?? 0);
  return {
    organizationId,
    projectId,
    balanceAtCutoff,
    committed,
    fundGrants,
    roundAdjustments,
    inRound: dec(values.inRound ?? 0),
    available: balanceAtCutoff.minus(committed).plus(fundGrants).plus(roundAdjustments),
    proposed: ZERO,
    includeDirect: true,
    held: false,
  };
};

const transfer = (
  id: number,
  amountNok: string,
  lines: [number, number | null, string][],
): Transfer => ({
  id,
  roundId: 1,
  payee: { id: 10, name: "GiveWell", currency: "NOK" },
  amountNok,
  currency: "NOK",
  amountForeign: null,
  fxRate: null,
  bankFee: null,
  paidAt: null,
  bankRef: null,
  paidBy: "foundation",
  notes: null,
  documents: [],
  lines: lines.map(([organizationId, projectId, amount], i) => ({
    id: id * 100 + i,
    transferId: id,
    organizationId,
    organizationName: `Org ${organizationId}`,
    projectId,
    projectName: projectId ? `Project ${projectId}` : null,
    amountNok: amount,
  })),
});

const grant = (
  id: number,
  fundId: number,
  rationale: string,
  lines: [number, number | null, string][],
): FundGrant => {
  const total = lines.reduce((s, [, , a]) => s.plus(a), dec(0)).toFixed(2);
  return {
    id,
    fundId,
    fundName: `Fund ${fundId}`,
    roundId: 1,
    rationale,
    approvedBy: null,
    approvedAt: null,
    createdBy: "alice",
    createdAt: new Date(),
    total,
    lines: lines.map(([organizationId, projectId, amount], i) => ({
      id: id * 100 + i,
      fundGrantId: id,
      organizationId,
      organizationName: `Org ${organizationId}`,
      projectId,
      projectName: projectId ? `Project ${projectId}` : null,
      amount,
    })),
  };
};

const valid = (): ValidationInput => ({
  positions: [
    position(AGF, null, { balanceAtCutoff: 1000, fundGrants: 500, inRound: 1500 }),
    position(GD, MOMS, { fundGrants: 200, inRound: 200 }),
    position(FUND, null, { balanceAtCutoff: 1000, fundGrants: -700 }),
  ],
  fundIds: new Set([FUND, FUND2]),
  transfers: [
    transfer(1, "1700.00", [
      [AGF, null, "1500.00"],
      [GD, MOMS, "200.00"],
    ]),
  ],
  fundGrants: [
    grant(1, FUND, "Good reasons", [
      [AGF, null, "500.00"],
      [GD, MOMS, "200.00"],
    ]),
  ],
  projectOrganizations: new Map([[MOMS, GD]]),
  payees: new Map([
    [AGF, { id: 10, name: "GiveWell", currency: "NOK" }],
    [GD, { id: 12, name: "GiveDirectly", currency: "NOK" }],
  ]),
  unassigned: { amount: "0.00", donationCount: 0 },
  donations: [],
  organizationNames: new Map([[AGF, "AGF"]]),
});

const codes = (input: ValidationInput) => validateRound(input).map((i) => [i.severity, i.code]);

describe("regranting validation before approval", () => {
  it("passes a consistent round", () => {
    expect(validateRound(valid())).to.deep.equal([]);
  });

  it("error: an own fund in a transfer line", () => {
    const input = valid();
    input.transfers = [transfer(2, "10.00", [[FUND, null, "10.00"]])];
    const [issue] = validateRound(input);
    expect(issue).to.include({
      severity: "error",
      code: "own_fund_in_transfer",
      organizationId: FUND,
      transferId: 2,
      transferLineId: 200,
    });
  });

  it("error: fund grants exceeding the fund's balance at the cutoff less what is committed", () => {
    const input = valid();
    input.positions[2] = position(FUND, null, {
      balanceAtCutoff: 1000,
      committed: 400,
      fundGrants: -700,
    });
    const [issue] = validateRound(input);
    expect(issue).to.include({
      severity: "error",
      code: "fund_grant_exceeds_balance",
      organizationId: FUND,
      fundGrantId: 1,
    });
    expect(issue.message).to.contain("700,00\u00a0kr").and.contain("600,00\u00a0kr");
  });

  it("counts the round's own adjustments to a fund in what it can grant", () => {
    const input = valid();
    input.positions[2] = position(FUND, null, {
      balanceAtCutoff: 1000,
      committed: 400,
      fundGrants: -700,
      roundAdjustments: 100,
    });
    expect(validateRound(input).some((i) => i.code === "fund_grant_exceeds_balance")).to.be.false;
  });

  it("error: a fund grant without a rationale", () => {
    const input = valid();
    input.fundGrants[0].rationale = "  ";
    expect(codes(input)).to.deep.equal([["error", "fund_grant_missing_rationale"]]);
  });

  it("error: a fund grant to another own fund", () => {
    const input = valid();
    input.fundGrants = [grant(3, FUND, "x", [[FUND2, null, "10.00"]])];
    const issues = validateRound(input);
    expect(issues.map((i) => i.code)).to.include("fund_to_fund_grant");
    expect(issues.find((i) => i.code === "fund_to_fund_grant")).to.include({
      fundGrantLineId: 300,
    });
  });

  it("error: a transfer whose lines don't sum to its amount", () => {
    const input = valid();
    input.transfers[0].amountNok = "1699.99";
    expect(validateRound(input)).to.have.length(1);
    expect(validateRound(input)[0]).to.include({ code: "transfer_lines_mismatch", transferId: 1 });
  });

  it("error: a project on a line that belongs to another recipient (transfer and fund grant lines)", () => {
    const input = valid();
    input.projectOrganizations = new Map([[MOMS, MC]]);
    const issues = validateRound(input).filter((i) => i.code === "project_recipient_mismatch");
    expect(issues.map((i) => [i.transferLineId, i.fundGrantLineId])).to.have.deep.members([
      [101, null],
      [null, 101],
    ]);
  });

  it("error: a major-donor donation already passed on", () => {
    const input = valid();
    const donation: RoundDonation = {
      donationId: 99,
      donorId: 1,
      sum: "10000.00",
      timestampConfirmed: new Date(),
      allocations: [],
      inScope: false,
      excludedReason: "passed_on",
      passedOnByRoundId: 7,
      frontedByAdjustmentId: null,
    };
    input.donations = [donation, { ...donation, donationId: 98, excludedReason: "after_cutoff" }];
    const issues = validateRound(input);
    expect(issues.map((i) => [i.code, i.donationId])).to.deep.equal([
      ["donation_already_passed_on", 99],
    ]);
  });

  it("warning: a negative balance after the round (own funds excluded)", () => {
    const input = valid();
    input.positions.push(position(MC, null, { balanceAtCutoff: -4000 }));
    input.positions[2] = position(FUND, null, { balanceAtCutoff: -10 });
    input.fundGrants = [];
    input.positions[0] = position(AGF, null, { balanceAtCutoff: 1500, inRound: 1500 });
    input.positions[1] = position(GD, MOMS, { balanceAtCutoff: 200, inRound: 200 });
    const issues = validateRound(input);
    expect(issues.map((i) => [i.severity, i.code, i.organizationId])).to.deep.equal([
      ["warning", "negative_balance", MC],
    ]);
    expect(hasErrors(issues)).to.be.false;
  });

  it("warning: a recipient with money but no payee", () => {
    const input = valid();
    input.positions.push(position(NOPAYEE, null, { balanceAtCutoff: 40 }));
    input.positions.push(position(MC, null, { balanceAtCutoff: 0 }));
    expect(codes(input)).to.deep.equal([["warning", "recipient_without_payee"]]);
    expect(validateRound(input)[0].organizationId).to.equal(NOPAYEE);
  });

  it("warning: money in Unassigned", () => {
    const input = valid();
    input.unassigned = { amount: "250.00", donationCount: 1 };
    expect(codes(input)).to.deep.equal([["warning", "unassigned_balance"]]);
  });

  it("hasErrors only counts errors", () => {
    expect(hasErrors([])).to.be.false;
    const input = valid();
    input.transfers[0].amountNok = "1.00";
    expect(hasErrors(validateRound(input))).to.be.true;
  });
});

describe("regranting payment check", () => {
  const eur = { currency: "EUR", amountNok: "11520.00", bankFee: null };

  it("a foreign-currency payment adds up within max(1 kr, 0.5 %)", () => {
    expect(paymentProblem({ ...eur, amountForeign: "1000", fxRate: "11.52" })).to.equal(null);
    // 0.5 % of 11 520 is 57.60
    expect(paymentProblem({ ...eur, amountForeign: "1000", fxRate: "11.5776" })).to.equal(null);
    expect(paymentProblem({ ...eur, amountForeign: "1000", fxRate: "11.578" })).to.match(
      /1000 EUR at 11\.578 NOK\/EUR is 11\s578,00\skr, but the transfer is 11\s520,00\skr \(more than 57,60\skr apart\)/,
    );
    // Small transfers: 1 kr
    const small = { ...eur, amountNok: "10.00" };
    expect(paymentProblem({ ...small, amountForeign: "0.95", fxRate: "11.5" })).to.equal(null);
    expect(paymentProblem({ ...small, amountForeign: "0.7", fxRate: "11.5" })).to.match(
      /1,00\skr apart/,
    );
  });

  it("needs both the foreign amount and the rate, and a NOK payment has neither", () => {
    expect(paymentProblem({ ...eur, amountForeign: null, fxRate: null })).to.equal(
      "A EUR transfer needs the amount paid in EUR and the FX rate (NOK per EUR)",
    );
    expect(paymentProblem({ ...eur, amountForeign: "1000", fxRate: null })).to.match(/FX rate/);
    const nok = { currency: "NOK", amountNok: "100.00", bankFee: 25 };
    expect(paymentProblem({ ...nok, amountForeign: null, fxRate: null })).to.equal(null);
    expect(paymentProblem({ ...nok, amountForeign: "100", fxRate: null })).to.match(/NOK transfer/);
    expect(paymentProblem({ ...nok, amountForeign: null, fxRate: null, bankFee: -1 })).to.match(
      /negative/,
    );
  });
});
