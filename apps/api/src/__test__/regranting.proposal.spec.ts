import { describe, it } from "vitest";
import { expect } from "chai";
import { dec, fmt, ZERO } from "../custom_modules/regranting/money";
import {
  proposeRound,
  type Position,
  type ProposalInput,
} from "../custom_modules/regranting/proposal";
import type { RoundKind } from "../custom_modules/regranting/types";

const AGF = 1;
const TCF = 2;
const MC = 3;
const FUND = 4;
const GD = 6;
const MOMS = 61;

const pos = (
  organizationId: number,
  projectId: number | null,
  balance: number,
  extra: Partial<Record<"committed" | "fundGrants" | "roundAdjustments" | "inRound", number>> = {},
): Position => ({
  organizationId,
  projectId,
  balanceAtCutoff: dec(balance),
  committed: dec(extra.committed ?? 0),
  fundGrants: dec(extra.fundGrants ?? 0),
  roundAdjustments: dec(extra.roundAdjustments ?? 0),
  inRound: dec(extra.inRound ?? 0),
});

const givewell = { id: 10, name: "GiveWell", currency: "NOK" };
const mcDirect = { id: 11, name: "MC", currency: "EUR" };
const giveDirectly = { id: 12, name: "GiveDirectly", currency: "NOK" };

const input = (overrides: Partial<ProposalInput> = {}): ProposalInput => ({
  kind: "regular",
  minTransfer: ZERO,
  positions: [pos(AGF, null, 1000), pos(TCF, null, 500), pos(MC, null, 300), pos(FUND, null, 5000)],
  fundIds: new Set([FUND]),
  chosenAllocations: new Map(),
  includeDirectOverrides: new Map(),
  holds: [],
  payees: new Map([
    [AGF, givewell],
    [TCF, givewell],
    [MC, givewell],
    [GD, giveDirectly],
  ]),
  ...overrides,
});

const proposed = (result: ReturnType<typeof proposeRound>) =>
  Object.fromEntries(
    result.positions.map((p) => [`${p.organizationId}:${p.projectId ?? ""}`, fmt(p.proposed)]),
  );

const transfers = (result: ReturnType<typeof proposeRound>) =>
  result.transfers.map((t) => ({
    payee: t.payee.id,
    currency: t.currency,
    lines: t.lines.map((l) => [l.organizationId, l.projectId, fmt(l.amount)]),
  }));

describe("regranting proposal rules", () => {
  it("regular: proposes every recipient's balance, never an own fund, one transfer per payee", () => {
    const result = proposeRound(input());
    expect(proposed(result)).to.deep.equal({
      "1:": "1000.00",
      "2:": "500.00",
      "3:": "300.00",
      "4:": "0.00",
    });
    expect(transfers(result)).to.deep.equal([
      {
        payee: givewell.id,
        currency: "NOK",
        lines: [
          [AGF, null, "1000.00"],
          [TCF, null, "500.00"],
          [MC, null, "300.00"],
        ],
      },
    ]);
  });

  it("proposes unrestricted plus every project balance, as separate lines", () => {
    const result = proposeRound(
      input({ positions: [pos(GD, null, 3000), pos(GD, MOMS, 0, { fundGrants: 2000 })] }),
    );
    expect(transfers(result)).to.deep.equal([
      {
        payee: giveDirectly.id,
        currency: "NOK",
        lines: [
          [GD, null, "3000.00"],
          [GD, MOMS, "2000.00"],
        ],
      },
    ]);
  });

  it("subtracts what other rounds committed and never proposes a negative amount", () => {
    const result = proposeRound(
      input({ positions: [pos(AGF, null, 1000, { committed: 400 }), pos(MC, null, -500)] }),
    );
    expect(proposed(result)).to.deep.equal({ "1:": "600.00", "3:": "0.00" });
    expect(result.positions.find((p) => p.organizationId === MC)!.available.toFixed(2)).to.equal(
      "-500.00",
    );
  });

  for (const kind of ["fund_grant", "extraordinary"] as RoundKind[]) {
    it(`${kind}: only this round's fund grants; direct balances stay`, () => {
      const result = proposeRound(
        input({
          kind,
          positions: [
            pos(AGF, null, 1000, { fundGrants: 250 }),
            pos(TCF, null, 500),
            pos(FUND, null, 5000, { fundGrants: -250 }),
          ],
        }),
      );
      expect(proposed(result)).to.deep.equal({ "1:": "250.00", "2:": "0.00", "4:": "0.00" });
    });
  }

  it("a fund grant is capped at what is available (e.g. after a fronted payment)", () => {
    const result = proposeRound(
      input({ kind: "fund_grant", positions: [pos(MC, null, -400, { fundGrants: 1000 })] }),
    );
    expect(proposed(result)["3:"]).to.equal("600.00");
  });

  it("the Include direct donations switch overrides the kind's default both ways", () => {
    const on = proposeRound(
      input({ kind: "fund_grant", includeDirectOverrides: new Map([[TCF, true]]) }),
    );
    expect(proposed(on)).to.include({ "1:": "0.00", "2:": "500.00" });
    expect(on.positions.find((p) => p.organizationId === TCF)!.includeDirect).to.be.true;

    const off = proposeRound(
      input({ kind: "regular", includeDirectOverrides: new Map([[AGF, false]]) }),
    );
    expect(proposed(off)).to.include({ "1:": "0.00", "2:": "500.00" });
  });

  describe("major_donor", () => {
    it("proposes only the chosen donations' allocations", () => {
      const result = proposeRound(
        input({
          kind: "major_donor",
          positions: [pos(MC, null, 10300), pos(AGF, null, 1000)],
          chosenAllocations: new Map([[MC, dec(10000)]]),
        }),
      );
      expect(proposed(result)).to.deep.equal({ "3:": "10000.00", "1:": "0.00" });
    });

    it("caps at the recipient's balance", () => {
      const result = proposeRound(
        input({
          kind: "major_donor",
          positions: [pos(MC, null, 10000, { committed: 4000 })],
          chosenAllocations: new Map([[MC, dec(10000)]]),
        }),
      );
      expect(proposed(result)["3:"]).to.equal("6000.00");
    });

    it("adds an unrestricted position for a chosen recipient with no balance row (proposes 0)", () => {
      const result = proposeRound(
        input({
          kind: "major_donor",
          positions: [],
          chosenAllocations: new Map([[TCF, dec(100)]]),
        }),
      );
      expect(proposed(result)).to.deep.equal({ "2:": "0.00" });
    });

    it("pays the whole balance for a recipient switched on", () => {
      const result = proposeRound(
        input({
          kind: "major_donor",
          positions: [pos(MC, null, 10300)],
          chosenAllocations: new Map([[MC, dec(10000)]]),
          includeDirectOverrides: new Map([[MC, true]]),
        }),
      );
      expect(proposed(result)["3:"]).to.equal("10300.00");
    });
  });

  it("groups by the payee valid at the cutoff: one transfer per payee and currency", () => {
    const result = proposeRound(
      input({
        payees: new Map([
          [AGF, givewell],
          [TCF, givewell],
          [MC, mcDirect],
        ]),
      }),
    );
    expect(transfers(result)).to.deep.equal([
      {
        payee: givewell.id,
        currency: "NOK",
        lines: [
          [AGF, null, "1000.00"],
          [TCF, null, "500.00"],
        ],
      },
      { payee: mcDirect.id, currency: "EUR", lines: [[MC, null, "300.00"]] },
    ]);
  });

  it("recipients without a payee are proposed but get no transfer", () => {
    const result = proposeRound(input({ payees: new Map([[AGF, givewell]]) }));
    expect(proposed(result)["2:"]).to.equal("500.00");
    expect(transfers(result)).to.deep.equal([
      { payee: givewell.id, currency: "NOK", lines: [[AGF, null, "1000.00"]] },
    ]);
  });

  it("holds: a recipient hold zeroes all its lines, a project hold only that project", () => {
    const positions = [pos(GD, null, 3000), pos(GD, MOMS, 2000), pos(AGF, null, 1000)];
    const whole = proposeRound(
      input({ positions, holds: [{ organizationId: GD, projectId: null }] }),
    );
    expect(proposed(whole)).to.deep.equal({ "6:": "0.00", "6:61": "0.00", "1:": "1000.00" });
    expect(whole.positions.filter((p) => p.held).length).to.equal(2);

    const project = proposeRound(
      input({ positions, holds: [{ organizationId: GD, projectId: MOMS }] }),
    );
    expect(proposed(project)).to.deep.equal({ "6:": "3000.00", "6:61": "0.00", "1:": "1000.00" });
  });

  it("minTransfer: a recipient whose total is under it is proposed 0 (it stays in the balance)", () => {
    const result = proposeRound(
      input({
        minTransfer: dec(600),
        positions: [
          pos(AGF, null, 1000),
          pos(TCF, null, 500),
          pos(GD, null, 400),
          pos(GD, MOMS, 300),
        ],
      }),
    );
    // GD's total 700 is over the minimum even though each line is under it
    expect(proposed(result)).to.deep.equal({
      "1:": "1000.00",
      "2:": "0.00",
      "6:": "400.00",
      "6:61": "300.00",
    });
  });

  it("the round's own adjustments (an earmark) count in what it can pay, in every kind", () => {
    const earmarked = [
      pos(GD, null, 3000, { roundAdjustments: -1000 }),
      pos(GD, MOMS, 0, { roundAdjustments: 1000 }),
    ];
    const regular = proposeRound(input({ positions: earmarked }));
    expect(proposed(regular)).to.deep.equal({ "6:": "2000.00", "6:61": "1000.00" });
    expect(regular.positions.map((p) => fmt(p.available))).to.deep.equal(["2000.00", "1000.00"]);
    // Without direct donations the round pays what it decided: the earmarked project
    const grantRound = proposeRound(input({ kind: "fund_grant", positions: earmarked }));
    expect(proposed(grantRound)).to.deep.equal({ "6:": "0.00", "6:61": "1000.00" });
  });
});
