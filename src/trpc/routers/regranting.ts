import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import type {
  AdjustmentInput,
  DocumentInput,
  ProjectFundGrantLine,
  ProjectTransferLine,
  Queryable,
} from "../../custom_modules/DAO_modules/regranting";
import { dateNo, todayOslo } from "../../custom_modules/regranting/money";
import {
  applyProposal,
  approveRound,
  earmark,
  getBalancesView,
  getRoundBuilder,
  getRoundOrThrow,
  getStatement,
  loadRoundState,
  lockRoundIn,
  markRoundPaid,
  removeEarmark,
  reopenRound,
  roundLabel,
  toRoundDonations,
  type ApproveResult,
  type BalancesView,
  type RoundBuilder,
  type Statement,
} from "../../custom_modules/regranting/service";
import { figuresFor } from "../../custom_modules/regranting/service";
import type {
  Adjustment,
  Fund,
  FundGrant,
  Hold,
  Issue,
  LedgerFigures,
  Payee,
  PayeeRouting,
  Project,
  RegrantDocument,
  RoundBalanceSnapshot,
  RoundDonation,
  RoundSummary,
  Transfer,
} from "../../custom_modules/regranting/types";
import {
  getBalanceBreakdown,
  getMonthlyReconciliation,
  getRoundComposition,
  type BalanceBreakdown,
  type MonthlyReconciliation,
  type RoundComposition,
} from "../../custom_modules/regranting/trace";
import { paymentProblem } from "../../custom_modules/regranting/validation";
import { adminIdentity } from "../identity";
import {
  adjustmentCreateInput,
  adjustmentListInput,
  adjustmentUpdateInput,
  balancesListInput,
  breakdownInput,
  byId,
  compositionInput,
  documentAddInput,
  documentListInput,
  earmarkInput,
  fundByOrganization,
  fundCreateInput,
  fundGrantCreateInput,
  fundGrantUpdateInput,
  fundUpdateInput,
  holdCreateInput,
  holdListInput,
  holdUpdateInput,
  includeDirectInput,
  linkDonationInput,
  payeeCreateInput,
  payeeUpdateInput,
  projectCreateInput,
  projectListInput,
  projectUpdateInput,
  proposeInput,
  reconciliationInput,
  recordPaymentInput,
  removeEarmarkInput,
  roundCreateInput,
  roundDonationsInput,
  roundListInput,
  roundUpdateInput,
  routingCreateInput,
  setNotesInput,
  routingListInput,
  routingUpdateInput,
  statementInput,
  transferCreateInput,
  transferSetLineInput,
  transferSetLinesInput,
  transferUpdateInput,
} from "../schemas/regranting";
import { adminProcedure, router } from "../trpc";

export type {
  Adjustment,
  BalanceBreakdown,
  BalancesView,
  MonthlyReconciliation,
  RoundComposition,
  Fund,
  FundGrant,
  Hold,
  Issue,
  Payee,
  PayeeRouting,
  Project,
  RegrantDocument,
  RoundBuilder,
  RoundSummary,
  Statement,
  Transfer,
};

/**
 * Regranting ("tildelinger"), docs/regranting.md. Balances are calculated from the donation
 * tables and the regranting ledger; rounds go draft → approved → paid. Draft-only edits lock the
 * round and fail with CONFLICT once it is approved or paid; paid rounds are never edited.
 */

const dao = () => DAO.regranting;
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = (message: string) => new TRPCError({ code: "NOT_FOUND", message });
const conflict = (message: string, cause?: unknown) =>
  new TRPCError({ code: "CONFLICT", message, cause });

/**
 * Messages are for people: they name recipients, projects, payees and rounds, and write dates
 * as dd.mm.yyyy and amounts in kroner. Ids appear only where there is no name (something that
 * doesn't exist) and in `cause`.
 */

/** Runs a delete; a row still referenced (MySQL 1451) becomes CONFLICT with `message` */
const deleteOrConflict = async (run: () => Promise<boolean>, message: string) => {
  try {
    return await run();
  } catch (err) {
    if ((err as { errno?: unknown })?.errno === 1451) throw conflict(message, err);
    throw err;
  }
};

//region Reference checks

const organizationNames = async () =>
  new Map((await dao().getOrganizations()).map((o) => [o.id, o.name]));

const assertOrganizations = async (ids: number[]) => {
  const names = await organizationNames();
  const missing = [...new Set(ids)].filter((id) => !names.has(id));
  if (missing.length) {
    throw badRequest(
      `${missing.length > 1 ? "Recipients" : "Recipient"} ${missing
        .map((id) => `#${id}`)
        .join(", ")} ${missing.length > 1 ? "don't" : "doesn't"} exist`,
    );
  }
  return names;
};

/** Projects exist and belong to the line's recipient */
const assertProjects = async (lines: { organizationId: number; projectId: number | null }[]) => {
  const projectIds = [
    ...new Set(lines.map((l) => l.projectId).filter((p): p is number => p !== null)),
  ];
  const owners = await dao().getProjectOrganizations(projectIds);
  for (const line of lines) {
    if (line.projectId === null) continue;
    const owner = owners.get(line.projectId);
    if (owner === undefined) throw badRequest(`Project #${line.projectId} doesn't exist`);
    if (owner !== line.organizationId) {
      const [names, projects] = await Promise.all([organizationNames(), dao().getProjectNames()]);
      const project = projects.get(line.projectId)?.name ?? `Project #${line.projectId}`;
      throw badRequest(
        `${project} is a project at ${names.get(owner) ?? `recipient #${owner}`}, not at ${
          names.get(line.organizationId) ?? `recipient #${line.organizationId}`
        }`,
      );
    }
  }
};

/** Lines of transfers and fund grants: recipients exist, aren't own funds, projects match */
const assertLines = async (
  lines: { organizationId: number; projectId: number | null }[],
  what: string,
) => {
  const names = await assertOrganizations(lines.map((l) => l.organizationId));
  const funds = new Set((await dao().listFunds()).map((f) => f.organizationId));
  const fundLine = lines.find((l) => funds.has(l.organizationId));
  if (fundLine) {
    throw badRequest(
      `${names.get(fundLine.organizationId)} is an own fund and can't be on ${what}`,
    );
  }
  await assertProjects(lines);
};

const getPayeeOrThrow = async (id: number, conn?: Queryable) => {
  const payee = await dao().getPayee(id, conn);
  if (!payee) throw badRequest(`Payee #${id} doesn't exist`);
  return payee;
};

const getTransferOrThrow = async (id: number, conn?: Queryable) => {
  const transfer = await dao().getTransfer(id, conn);
  if (!transfer) throw notFound(`Transfer #${id} not found`);
  return transfer;
};

const getFundGrantOrThrow = async (id: number, conn?: Queryable) => {
  const grant = await dao().getFundGrant(id, conn);
  if (!grant) throw notFound(`Fund grant #${id} not found`);
  return grant;
};

const getAdjustmentOrThrow = async (id: number, conn?: Queryable) => {
  const adjustment = await dao().getAdjustment(id, conn);
  if (!adjustment) throw notFound(`Adjustment #${id} not found`);
  return adjustment;
};

const summaryOrThrow = async (id: number): Promise<RoundSummary> => {
  const summary = await dao().getRoundSummary(id);
  if (!summary) throw notFound(`Round #${id} not found`);
  return summary;
};

const assertDonations = async (ids: number[]) => {
  const unique = [...new Set(ids)];
  const existing = new Set(await dao().existingDonationIds(unique));
  const missing = unique.filter((id) => !existing.has(id));
  if (missing.length) {
    throw badRequest(
      `${missing.length > 1 ? "Donations" : "Donation"} ${missing
        .map((id) => `#${id}`)
        .join(", ")} ${missing.length > 1 ? "don't" : "doesn't"} exist`,
    );
  }
  return unique;
};

//endregion

//region Balances and statements

const balancesRouter = router({
  /**
   * The Balances page: one row per recipient (active ones, own funds, and any with entries),
   * with unrestricted and per-project figures, inflow since the last regular round, the last
   * paid transfer, active holds and the own-fund flag.
   */
  list: adminProcedure
    .input(balancesListInput)
    .query(({ input }): Promise<BalancesView> => getBalancesView(input ?? {})),

  /**
   * Where a balance comes from: each figure of the Balances page (or, with roundId, of the round
   * builder's line at the round's cutoff) with the entries behind it, allocations by UTC month
   * with what the Donations list shows for each month, and `check`, the same figures from the
   * balance query. The figures add up exactly.
   */
  breakdown: adminProcedure
    .input(breakdownInput)
    .query(({ input }): Promise<BalanceBreakdown> => getBalanceBreakdown(input)),
});

/** The checking routine before approving a round (docs/regranting.md, "Checking the numbers") */
const reconciliationRouter = router({
  /**
   * Per recipient and UTC month: allocations from the view vs a recomputation straight from the
   * donation tables; per month: allocations + Unassigned vs confirmed donations (15/16 excluded).
   */
  monthly: adminProcedure
    .input(reconciliationInput)
    .query(({ input }): Promise<MonthlyReconciliation> => getMonthlyReconciliation(input)),
});

const statementsRouter = router({
  /** All entries for a recipient over a period with a running balance */
  recipient: adminProcedure
    .input(statementInput)
    .query(({ input }): Promise<Statement> => getStatement(input)),
});

//endregion

//region Rounds

export type RoundDetail = {
  round: RoundSummary;
  /** Written at approval; empty for drafts */
  snapshot: RoundBalanceSnapshot[];
  transfers: Transfer[];
  fundGrants: FundGrant[];
  /** Adjustments attached to the round (earmarks, corrections); they count once it is approved */
  adjustments: Adjustment[];
  /** major_donor only */
  donations: RoundDonation[];
  includeDirectOverrides: { organizationId: number; includeDirect: boolean }[];
  /** The round's own documents (decision, board minutes); transfers and adjustments carry theirs */
  documents: RegrantDocument[];
};

const roundsRouter = router({
  list: adminProcedure
    .input(roundListInput)
    .query(({ input }): Promise<RoundSummary[]> => dao().listRounds(input ?? {})),

  /** Round history: the round with its snapshot, transfers and fund grants */
  get: adminProcedure.input(byId).query(async ({ input }): Promise<RoundDetail> => {
    const round = await summaryOrThrow(input.id);
    const [snapshot, transfers, fundGrants, adjustments, donations, overrides, documents] =
      await Promise.all([
        dao().getSnapshot(round.id),
        dao().getTransfers(round.id),
        dao().getFundGrants(round.id),
        dao().listAdjustments({ roundId: round.id }),
        round.kind === "major_donor" ? dao().getRoundDonations(round.id) : Promise.resolve([]),
        dao().getIncludeDirectOverrides(round.id),
        dao().listDocuments({ roundId: round.id }),
      ]);
    return {
      round,
      snapshot,
      transfers,
      fundGrants,
      adjustments,
      donations: toRoundDonations(donations),
      includeDirectOverrides: [...overrides].map(([organizationId, includeDirect]) => ({
        organizationId,
        includeDirect,
      })),
      documents,
    };
  }),

  /**
   * What each transfer line contained (FIFO, docs/regranting.md): the round's own chosen
   * donations, fund grants and adjustments, then money carried over from before the recipient's
   * previous transfer, then money since, and anything paid ahead with what covered it later.
   * Each line's parts add up to its amount. Drafts use their saved lines.
   */
  composition: adminProcedure
    .input(compositionInput)
    .query(({ input }): Promise<RoundComposition> => getRoundComposition(input)),

  /** The round builder: step 1 (own funds, fund grants), step 2 (recipients by payee), issues */
  builder: adminProcedure
    .input(byId)
    .query(({ input }): Promise<RoundBuilder> => getRoundBuilder(input.id)),

  /** Creates a draft (and, by default, fills it with the proposal). Returns the builder. */
  create: adminProcedure
    .input(roundCreateInput)
    .mutation(async ({ input, ctx }): Promise<RoundBuilder> => {
      const donationIds = input.donationIds ? await assertDonations(input.donationIds) : [];
      const id = await dao().inTransaction(async (conn) => {
        const roundId = await dao().createRound(conn, input, adminIdentity(ctx.auth));
        if (donationIds.length) await dao().setRoundDonations(conn, roundId, donationIds);
        return roundId;
      });
      if (input.propose) await applyProposal(id, null);
      return getRoundBuilder(id);
    }),

  /**
   * Name, cutoff, minTransfer of a draft. The draft's earmarks (dated the cutoff) move with the
   * cutoff. Doesn't re-propose: call propose after a cutoff change.
   */
  update: adminProcedure
    .input(roundUpdateInput)
    .mutation(async ({ input }): Promise<RoundSummary> => {
      await dao().inTransaction(async (conn) => {
        const round = await lockRoundIn(conn, input.id, ["draft"], "edit");
        const cutoff = input.cutoff ?? round.cutoff;
        await dao().updateRound(conn, round.id, {
          name: input.name ?? round.name,
          cutoff,
          minTransfer: input.minTransfer ?? Number(round.minTransfer),
        });
        if (cutoff !== round.cutoff)
          await dao().moveRoundEarmarks(conn, round.id, round.cutoff, cutoff);
      });
      return summaryOrThrow(input.id);
    }),

  /** major_donor drafts: replaces the chosen donations. Doesn't re-propose. */
  setDonations: adminProcedure
    .input(roundDonationsInput)
    .mutation(async ({ input }): Promise<RoundDonation[]> => {
      const donationIds = await assertDonations(input.donationIds);
      await dao().inTransaction(async (conn) => {
        const round = await lockRoundIn(conn, input.id, ["draft"], "edit");
        if (round.kind !== "major_donor")
          throw badRequest(
            `${round.name} isn't a major-donor round; only those have chosen donations`,
          );
        await dao().setRoundDonations(conn, round.id, donationIds);
      });
      return toRoundDonations(await dao().getRoundDonations(input.id));
    }),

  /**
   * The per-recipient Include direct donations switch (null = the kind's default). By default
   * re-proposes that recipient's lines.
   */
  setIncludeDirect: adminProcedure.input(includeDirectInput).mutation(async ({ input }) => {
    await assertOrganizations([input.organizationId]);
    await dao().inTransaction(async (conn) => {
      await lockRoundIn(conn, input.roundId, ["draft"], "edit");
      await dao().setIncludeDirect(conn, input.roundId, input.organizationId, input.includeDirect);
    });
    if (input.propose) await applyProposal(input.roundId, [input.organizationId]);
    return {
      roundId: input.roundId,
      organizationId: input.organizationId,
      includeDirectOverride: input.includeDirect,
    };
  }),

  /**
   * Replaces the draft's transfer lines with the proposal (for the given recipients, or all),
   * one transfer per payee and currency. Manual edits to those recipients are lost.
   */
  propose: adminProcedure.input(proposeInput).mutation(async ({ input }): Promise<RoundBuilder> => {
    await applyProposal(input.id, input.organizationIds ?? null);
    return getRoundBuilder(input.id);
  }),

  /** The validation issues approval would see (errors block approval, warnings don't). Drafts only: approved and paid rounds return [] */
  validate: adminProcedure.input(byId).query(async ({ input }): Promise<Issue[]> => {
    return (await loadRoundState(input.id)).issues;
  }),

  /**
   * Approves a draft: approver ≠ creator (FORBIDDEN otherwise). With validation errors nothing
   * changes and `approved` is false. On success writes the balance snapshot and approves the
   * round's fund grants with it.
   */
  approve: adminProcedure
    .input(byId)
    .mutation(
      ({ input, ctx }): Promise<ApproveResult> => approveRound(input.id, adminIdentity(ctx.auth)),
    ),

  /** Notes for the record. Documentation, not money: allowed in any status, also paid. */
  setNotes: adminProcedure
    .input(setNotesInput)
    .mutation(async ({ input }): Promise<RoundSummary> => {
      // affectedRows can't tell "missing" from "unchanged"; summaryOrThrow reports a missing round
      await dao().setRoundNotes(input.id, input.notes);
      return summaryOrThrow(input.id);
    }),

  /** approved → draft, while no payment is recorded */
  reopen: adminProcedure.input(byId).mutation(async ({ input }): Promise<RoundSummary> => {
    await reopenRound(input.id);
    return summaryOrThrow(input.id);
  }),

  /** approved → paid once every transfer's payment is recorded; its entries take effect */
  markPaid: adminProcedure.input(byId).mutation(async ({ input }): Promise<RoundSummary> => {
    await markRoundPaid(input.id);
    return summaryOrThrow(input.id);
  }),

  /**
   * Earmarks part of a recipient's unrestricted balance to one of its projects in a draft: two
   * paired reallocation adjustments attached to the round and dated its cutoff (unrestricted −X,
   * project +X), and X of Pay now moved from the unrestricted line to the project line (as much
   * as the unrestricted line pays). Balances change only once the round is approved. BAD_REQUEST
   * if the project isn't the recipient's or X is more than the unrestricted available.
   */
  earmark: adminProcedure
    .input(earmarkInput)
    .mutation(async ({ input, ctx }): Promise<RoundBuilder> => {
      await earmark(input, adminIdentity(ctx.auth));
      return getRoundBuilder(input.roundId);
    }),

  /** Undoes an earmark in a draft (either half's adjustment id), moving Pay now back */
  removeEarmark: adminProcedure
    .input(removeEarmarkInput)
    .mutation(async ({ input }): Promise<RoundBuilder> => {
      const { roundId } = await removeEarmark(input.adjustmentId);
      return getRoundBuilder(roundId);
    }),

  /** Deletes a draft with its transfers, fund grants and adjustments (earmarks, corrections) */
  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    await dao().inTransaction(async (conn) => {
      await lockRoundIn(conn, input.id, ["draft"], "delete");
      await dao().deleteRound(conn, input.id);
    });
    return { id: input.id };
  }),
});

//endregion

//region Transfers

/** Locks the transfer's round, requiring one of the statuses */
const lockTransferRound = async (
  conn: Queryable,
  transferId: number,
  statuses: ("draft" | "approved")[],
  action: string,
) => {
  const transfer = await getTransferOrThrow(transferId, conn);
  await lockRoundIn(conn, transfer.roundId, statuses, action);
  return transfer;
};

const transfersRouter = router({
  get: adminProcedure
    .input(byId)
    .query(({ input }): Promise<Transfer> => getTransferOrThrow(input.id)),

  /** Adds a transfer to a draft (currency defaults to the payee's) */
  create: adminProcedure
    .input(transferCreateInput)
    .mutation(async ({ input }): Promise<Transfer> => {
      const payee = await getPayeeOrThrow(input.payeeId);
      if (input.lines) await assertLines(input.lines, "a transfer line");
      const id = await dao().inTransaction(async (conn) => {
        await lockRoundIn(conn, input.roundId, ["draft"], "add a transfer to");
        const transferId = await dao().createTransfer(conn, {
          roundId: input.roundId,
          payeeId: payee.id,
          currency: input.currency ?? payee.currency,
          amountNok: 0,
          notes: input.notes ?? null,
        });
        const lines = (input.lines ?? []).map((l) => ({ ...l, amount: l.amountNok }));
        await dao().replaceTransferLines(conn, transferId, lines, true);
        return transferId;
      });
      return getTransferOrThrow(id);
    }),

  /** Payee, currency or the bank amount of a draft's transfer */
  update: adminProcedure
    .input(transferUpdateInput)
    .mutation(async ({ input }): Promise<Transfer> => {
      if (input.payeeId !== undefined) await getPayeeOrThrow(input.payeeId);
      await dao().inTransaction(async (conn) => {
        const transfer = await lockTransferRound(conn, input.id, ["draft"], "edit");
        await dao().updateTransfer(conn, transfer.id, {
          payeeId: input.payeeId ?? transfer.payee.id,
          currency: input.currency ?? transfer.currency,
          amountNok: input.amountNok ?? transfer.amountNok,
        });
        if (input.notes !== undefined) await dao().setTransferNotes(transfer.id, input.notes, conn);
      });
      return getTransferOrThrow(input.id);
    }),

  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    await dao().inTransaction(async (conn) => {
      await lockTransferRound(conn, input.id, ["draft"], "edit");
      await dao().deleteTransfer(conn, input.id);
    });
    return { id: input.id };
  }),

  /** Replaces all lines of a draft's transfer */
  setLines: adminProcedure
    .input(transferSetLinesInput)
    .mutation(async ({ input }): Promise<Transfer> => {
      await assertLines(input.lines, "a transfer line");
      await dao().inTransaction(async (conn) => {
        await lockTransferRound(conn, input.id, ["draft"], "edit");
        await dao().replaceTransferLines(
          conn,
          input.id,
          input.lines.map((l) => ({ ...l, amount: l.amountNok })),
          input.syncAmount,
        );
      });
      return getTransferOrThrow(input.id);
    }),

  /** Sets one (recipient, project) line of a draft's transfer ("Pay now"); 0 removes it */
  setLine: adminProcedure
    .input(transferSetLineInput)
    .mutation(async ({ input }): Promise<Transfer> => {
      await assertLines([input], "a transfer line");
      await dao().inTransaction(async (conn) => {
        const transfer = await lockTransferRound(conn, input.id, ["draft"], "edit");
        const others = transfer.lines
          .filter(
            (l) => !(l.organizationId === input.organizationId && l.projectId === input.projectId),
          )
          .map((l) => ({
            organizationId: l.organizationId,
            projectId: l.projectId,
            amount: l.amountNok,
          }));
        const lines =
          input.amountNok > 0
            ? [
                ...others,
                {
                  organizationId: input.organizationId,
                  projectId: input.projectId,
                  amount: input.amountNok,
                },
              ]
            : others;
        await dao().replaceTransferLines(conn, transfer.id, lines, true);
      });
      return getTransferOrThrow(input.id);
    }),

  /**
   * Records the actual payment of an approved round's transfer (can be corrected until the round
   * is marked paid). BAD_REQUEST unless it adds up (paymentProblem): a foreign-currency transfer
   * needs amountForeign and fxRate with amountForeign × fxRate ≈ amountNok (max(1 kr, 0.5 %)); a
   * NOK transfer has neither.
   */
  recordPayment: adminProcedure
    .input(recordPaymentInput)
    .mutation(async ({ input }): Promise<Transfer> => {
      await dao().inTransaction(async (conn) => {
        const transfer = await lockTransferRound(
          conn,
          input.id,
          ["approved"],
          "record a payment in",
        );
        const currency = input.currency ?? transfer.currency;
        const problem = paymentProblem({
          currency,
          amountNok: transfer.amountNok,
          amountForeign: input.amountForeign,
          fxRate: input.fxRate,
          bankFee: input.bankFee,
        });
        if (problem) throw badRequest(problem);
        await dao().recordPayment(conn, transfer.id, {
          paidAt: input.paidAt,
          currency,
          amountForeign: input.amountForeign,
          fxRate: input.fxRate,
          bankFee: input.bankFee,
          bankRef: input.bankRef,
          paidBy: input.paidBy,
        });
      });
      return getTransferOrThrow(input.id);
    }),

  /** Notes for the record. Documentation, not money: allowed in any status, also paid. */
  setNotes: adminProcedure.input(setNotesInput).mutation(async ({ input }): Promise<Transfer> => {
    await dao().setTransferNotes(input.id, input.notes);
    return getTransferOrThrow(input.id);
  }),

  /** Clears a recorded payment while the round is still approved */
  clearPayment: adminProcedure.input(byId).mutation(async ({ input }): Promise<Transfer> => {
    await dao().inTransaction(async (conn) => {
      await lockTransferRound(conn, input.id, ["approved"], "clear a payment in");
      await dao().clearPayment(conn, input.id);
    });
    return getTransferOrThrow(input.id);
  }),
});

//endregion

//region Fund grants

const assertFund = async (fundId: number) => {
  const fund = await dao().getFund(fundId);
  if (!fund) {
    const name = (await organizationNames()).get(fundId) ?? `Recipient #${fundId}`;
    throw badRequest(`${name} isn't an own fund; only own funds make fund grants`);
  }
  return fund;
};

const fundGrantsRouter = router({
  get: adminProcedure
    .input(byId)
    .query(({ input }): Promise<FundGrant> => getFundGrantOrThrow(input.id)),

  /**
   * A grant from an own fund in a draft: the fund is debited the lines' sum, the recipients and
   * projects credited. Doesn't re-propose; call rounds.propose for the recipients afterwards.
   */
  create: adminProcedure
    .input(fundGrantCreateInput)
    .mutation(async ({ input, ctx }): Promise<FundGrant> => {
      await assertFund(input.fundId);
      await assertLines(input.lines, "a fund grant (fund-to-fund grants are not allowed)");
      const id = await dao().inTransaction(async (conn) => {
        await lockRoundIn(conn, input.roundId, ["draft"], "add a fund grant to");
        const grantId = await dao().createFundGrant(conn, input, adminIdentity(ctx.auth));
        await dao().replaceFundGrantLines(conn, grantId, input.lines);
        return grantId;
      });
      return getFundGrantOrThrow(id);
    }),

  /** Rationale and/or lines (replaced) of a draft's fund grant */
  update: adminProcedure
    .input(fundGrantUpdateInput)
    .mutation(async ({ input }): Promise<FundGrant> => {
      if (input.lines)
        await assertLines(input.lines, "a fund grant (fund-to-fund grants are not allowed)");
      await dao().inTransaction(async (conn) => {
        const grant = await getFundGrantOrThrow(input.id, conn);
        await lockRoundIn(conn, grant.roundId, ["draft"], "edit");
        if (input.rationale !== undefined)
          await dao().updateFundGrantRationale(conn, grant.id, input.rationale);
        if (input.lines) await dao().replaceFundGrantLines(conn, grant.id, input.lines);
      });
      return getFundGrantOrThrow(input.id);
    }),

  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    await dao().inTransaction(async (conn) => {
      const grant = await getFundGrantOrThrow(input.id, conn);
      await lockRoundIn(conn, grant.roundId, ["draft"], "edit");
      await dao().deleteFundGrant(conn, grant.id);
    });
    return { id: input.id };
  }),
});

//endregion

//region Adjustments

/** Checks references; the attached round is checked (locked) by the caller's transaction */
const checkAdjustment = async (input: AdjustmentInput) => {
  await assertOrganizations([input.organizationId]);
  await assertProjects([input]);
  if (input.linkedTransferId !== null) {
    const transfer = await dao().getTransfer(input.linkedTransferId);
    if (!transfer) throw badRequest(`Transfer #${input.linkedTransferId} doesn't exist`);
    const round = await getRoundOrThrow(transfer.roundId);
    if (round.status !== "paid") {
      throw badRequest(
        `The transfer to ${transfer.payee.name} in ${roundLabel(
          round,
        )} isn't paid; a correction links a transfer of a paid round`,
      );
    }
  }
  if (input.linkedDonationId !== null) await assertDonations([input.linkedDonationId]);
};

/**
 * Locks the rounds an adjustment is (or will be) attached to, in id order: they must be drafts.
 * Adjustments in an approved or paid round are part of that decision and can't change; locking
 * also keeps them from changing while the round is being approved.
 */
const lockAdjustmentRounds = async (
  conn: Queryable,
  roundIds: (number | null)[],
  action: string,
) => {
  const ids = [...new Set(roundIds.filter((id): id is number => id !== null))].sort(
    (a, b) => a - b,
  );
  for (const id of ids) await lockRoundIn(conn, id, ["draft"], action);
};

const earmarkHalf = (adjustment: Adjustment) =>
  `This entry is half of an earmark (${adjustment.reason})`;

const adjustmentsRouter = router({
  list: adminProcedure
    .input(adjustmentListInput)
    .query(({ input }): Promise<Adjustment[]> => dao().listAdjustments(input ?? {})),

  get: adminProcedure
    .input(byId)
    .query(({ input }): Promise<Adjustment> => getAdjustmentOrThrow(input.id)),

  /**
   * A typed, signed ledger entry with reason and author. Counts from effective_at; attached to a
   * round (a draft), it counts only once that round is approved.
   */
  create: adminProcedure
    .input(adjustmentCreateInput)
    .mutation(async ({ input, ctx }): Promise<Adjustment> => {
      await checkAdjustment(input);
      const id = await dao().inTransaction(async (conn) => {
        await lockAdjustmentRounds(conn, [input.roundId], "add an adjustment to");
        return dao().createAdjustment(input, adminIdentity(ctx.auth), conn);
      });
      return getAdjustmentOrThrow(id);
    }),

  /**
   * Replaces all fields; only for adjustments not in an approved or paid round. Half of an
   * earmark can't be edited on its own (CONFLICT): remove the earmark and make it again.
   */
  update: adminProcedure
    .input(adjustmentUpdateInput)
    .mutation(async ({ input }): Promise<Adjustment> => {
      const { id, ...fields } = input;
      await checkAdjustment(fields);
      await dao().inTransaction(async (conn) => {
        const current = await getAdjustmentOrThrow(id, conn);
        await lockAdjustmentRounds(
          conn,
          [current.roundId, fields.roundId],
          "change an adjustment in",
        );
        if (current.pairedAdjustmentId !== null) {
          throw conflict(`${earmarkHalf(current)}; remove the earmark and make it again`);
        }
        await dao().updateAdjustment(id, fields, conn);
      });
      return getAdjustmentOrThrow(id);
    }),

  /**
   * Links (or unlinks) the expected donation of a fronted entry once it is registered, also
   * after its round is paid. A linked donation counts as passed on: major_donor rounds skip it.
   */
  linkDonation: adminProcedure
    .input(linkDonationInput)
    .mutation(async ({ input }): Promise<Adjustment> => {
      const adjustment = await getAdjustmentOrThrow(input.id);
      if (adjustment.type !== "fronted") throw badRequest("Only fronted entries link a donation");
      if (input.donationId !== null) await assertDonations([input.donationId]);
      await dao().linkAdjustmentDonation(adjustment.id, input.donationId);
      return getAdjustmentOrThrow(input.id);
    }),

  /**
   * Deletes an adjustment not in an approved or paid round. Half of an earmark deletes both halves
   * (the round's Pay now stays; rounds.removeEarmark also moves it back). Returns the ids deleted.
   */
  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    const ids = await dao().inTransaction(async (conn) => {
      const adjustment = await getAdjustmentOrThrow(input.id, conn);
      await lockAdjustmentRounds(conn, [adjustment.roundId], "delete an adjustment in");
      const ids = [
        input.id,
        ...(adjustment.pairedAdjustmentId ? [adjustment.pairedAdjustmentId] : []),
      ];
      await dao().deleteAdjustments(conn, ids);
      return ids;
    });
    return { id: input.id, deletedIds: ids };
  }),
});

//endregion

//region Documents

/** The round, transfer or adjustment a document input points at exists */
const assertDocumentParent = async (parent: {
  roundId?: number;
  transferId?: number;
  adjustmentId?: number;
}) => {
  if (parent.roundId !== undefined && !(await dao().getRound(parent.roundId)))
    throw badRequest(`Round #${parent.roundId} doesn't exist`);
  if (parent.transferId !== undefined && !(await dao().getTransfer(parent.transferId)))
    throw badRequest(`Transfer #${parent.transferId} doesn't exist`);
  if (parent.adjustmentId !== undefined && !(await dao().getAdjustment(parent.adjustmentId)))
    throw badRequest(`Adjustment #${parent.adjustmentId} doesn't exist`);
};

/**
 * Links to documents (bilag, receipts, bank confirmations; usually Google Drive) on a round, a
 * transfer or an adjustment. Documentation, not money: they can be added and removed in any
 * status, also on approved and paid rounds.
 */
const documentsRouter = router({
  /** The documents of exactly one round (its own, not its transfers'), transfer or adjustment */
  list: adminProcedure
    .input(documentListInput)
    .query(async ({ input }): Promise<RegrantDocument[]> => {
      await assertDocumentParent(input);
      return dao().listDocuments(input as DocumentInput);
    }),

  /** Adds a link to exactly one round, transfer or adjustment */
  add: adminProcedure
    .input(documentAddInput)
    .mutation(async ({ input, ctx }): Promise<RegrantDocument> => {
      await assertDocumentParent(input);
      const id = await dao().addDocument(input as DocumentInput, adminIdentity(ctx.auth));
      const document = await dao().getDocument(id);
      if (!document) throw notFound(`Document #${id} not found`);
      return document;
    }),

  remove: adminProcedure.input(byId).mutation(async ({ input }) => {
    if (!(await dao().deleteDocument(input.id))) throw notFound(`Document #${input.id} not found`);
    return { id: input.id };
  }),
});

//endregion

//region Payees and routing

const getPayeeNotFound = async (id: number) => {
  const payee = await dao().getPayee(id);
  if (!payee) throw notFound(`Payee #${id} not found`);
  return payee;
};

const payeesRouter = router({
  list: adminProcedure.query((): Promise<Payee[]> => dao().listPayees()),

  /** The payee with its recipients over time */
  get: adminProcedure
    .input(byId)
    .query(async ({ input }): Promise<Payee & { routings: PayeeRouting[] }> => {
      const payee = await getPayeeNotFound(input.id);
      return { ...payee, routings: await dao().listRoutings({ payeeId: payee.id }) };
    }),

  create: adminProcedure.input(payeeCreateInput).mutation(async ({ input }): Promise<Payee> => {
    const id = await dao().createPayee(input);
    return getPayeeNotFound(id);
  }),

  update: adminProcedure.input(payeeUpdateInput).mutation(async ({ input }): Promise<Payee> => {
    const { id, ...changes } = input;
    const payee = await getPayeeNotFound(id);
    await dao().updatePayee(id, { ...payee, ...changes });
    return getPayeeNotFound(id);
  }),

  /** CONFLICT while routings or transfers use it (set isActive false instead) */
  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    const payee = await getPayeeNotFound(input.id);
    await deleteOrConflict(
      () => dao().deletePayee(input.id),
      `${payee.name} is still used by routings or transfers; mark it inactive instead`,
    );
    return { id: input.id };
  }),
});

const getRoutingOrThrow = async (id: number) => {
  const routing = await dao().getRouting(id);
  if (!routing) throw notFound(`Routing #${id} not found`);
  return routing;
};

const assertNoOverlap = async (
  r: { organizationId: number; validFrom: string; validTo: string | null },
  exceptId?: number,
) => {
  const overlapping = await dao().overlappingRoutings(
    r.organizationId,
    r.validFrom,
    r.validTo,
    exceptId,
  );
  if (overlapping.length) {
    const o = overlapping[0];
    throw conflict(
      `${o.organizationName} is already routed to ${o.payeeName} from ${dateNo(o.validFrom)}${
        o.validTo ? ` to ${dateNo(o.validTo)}` : ""
      }; end that routing first`,
      { routingId: o.id },
    );
  }
};

/** Which payee handles a recipient, dated (Organization_payees). No overlaps per recipient. */
const routingsRouter = router({
  list: adminProcedure
    .input(routingListInput)
    .query(({ input }): Promise<PayeeRouting[]> => dao().listRoutings(input ?? {})),

  create: adminProcedure
    .input(routingCreateInput)
    .mutation(async ({ input }): Promise<PayeeRouting> => {
      await assertOrganizations([input.organizationId]);
      await getPayeeOrThrow(input.payeeId);
      await assertNoOverlap(input);
      return getRoutingOrThrow(await dao().createRouting(input));
    }),

  update: adminProcedure
    .input(routingUpdateInput)
    .mutation(async ({ input }): Promise<PayeeRouting> => {
      const current = await getRoutingOrThrow(input.id);
      const next = {
        organizationId: input.organizationId ?? current.organizationId,
        payeeId: input.payeeId ?? current.payeeId,
        validFrom: input.validFrom ?? current.validFrom,
        validTo: input.validTo !== undefined ? input.validTo : current.validTo,
      };
      if (next.validTo !== null && next.validTo < next.validFrom)
        throw badRequest(
          `The routing ends (${dateNo(next.validTo)}) before it starts (${dateNo(next.validFrom)})`,
        );
      await assertOrganizations([next.organizationId]);
      await getPayeeOrThrow(next.payeeId);
      await assertNoOverlap(next, input.id);
      await dao().updateRouting(input.id, next);
      return getRoutingOrThrow(input.id);
    }),

  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    if (!(await dao().deleteRouting(input.id))) throw notFound(`Routing #${input.id} not found`);
    return { id: input.id };
  }),
});

//endregion

//region Projects

export type ProjectPage = {
  project: Project;
  /** Balance of the project today */
  figures: LedgerFigures;
  hold: Hold | null;
  transferLines: ProjectTransferLine[];
  fundGrantLines: ProjectFundGrantLine[];
  adjustments: Adjustment[];
};

const getProjectOrThrow = async (id: number) => {
  const project = await dao().getProject(id);
  if (!project) throw notFound(`Project #${id} not found`);
  return project;
};

const projectsRouter = router({
  list: adminProcedure
    .input(projectListInput)
    .query(({ input }): Promise<Project[]> => dao().listProjects(input ?? {})),

  /** The project page: metadata, balance, every transfer and fund grant line, adjustments */
  get: adminProcedure.input(byId).query(async ({ input }): Promise<ProjectPage> => {
    const project = await getProjectOrThrow(input.id);
    const today = todayOslo();
    const [balances, holds, lines, adjustments] = await Promise.all([
      dao().getBalances({ at: today, organizationIds: [project.organizationId] }),
      dao().listHolds({ activeAt: today, organizationId: project.organizationId }),
      dao().getProjectLines(project.id),
      dao().listAdjustments({ projectId: project.id }),
    ]);
    return {
      project,
      figures: figuresFor(balances.filter((b) => b.projectId === project.id)),
      hold: holds.find((h) => h.projectId === project.id) ?? null,
      ...lines,
      adjustments,
    };
  }),

  create: adminProcedure.input(projectCreateInput).mutation(async ({ input }): Promise<Project> => {
    await assertOrganizations([input.organizationId]);
    return getProjectOrThrow(await dao().createProject(input));
  }),

  /** Moving a project to another recipient is only allowed while nothing points at it */
  update: adminProcedure.input(projectUpdateInput).mutation(async ({ input }): Promise<Project> => {
    const { id, ...changes } = input;
    const current = await getProjectOrThrow(id);
    const next = { ...current, ...changes };
    if (next.organizationId !== current.organizationId) {
      await assertOrganizations([next.organizationId]);
      if (await dao().projectHasEntries(id)) {
        throw conflict(
          `${current.name} has lines or adjustments at ${current.organizationName}; it can't move to another recipient`,
        );
      }
    }
    await dao().updateProject(id, next);
    return getProjectOrThrow(id);
  }),

  /** CONFLICT while lines, adjustments or holds point at it */
  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    const project = await getProjectOrThrow(input.id);
    await deleteOrConflict(
      () => dao().deleteProject(input.id),
      `${project.name} at ${project.organizationName} has lines, adjustments or holds; set its status to cancelled instead`,
    );
    return { id: input.id };
  }),
});

//endregion

//region Funds and holds

const getFundOrThrow = async (organizationId: number) => {
  const fund = await dao().getFund(organizationId);
  if (!fund) {
    const name = (await organizationNames()).get(organizationId) ?? `Recipient #${organizationId}`;
    throw notFound(`${name} isn't an own fund`);
  }
  return fund;
};

/** Own funds (Funds): recipients Gi Effektivt distributes itself through fund grants */
const fundsRouter = router({
  list: adminProcedure.query((): Promise<Fund[]> => dao().listFunds()),

  get: adminProcedure
    .input(fundByOrganization)
    .query(({ input }): Promise<Fund> => getFundOrThrow(input.organizationId)),

  /** Marks a recipient as an own fund. CONFLICT if it already is one. */
  create: adminProcedure.input(fundCreateInput).mutation(async ({ input }): Promise<Fund> => {
    const names = await assertOrganizations([input.organizationId]);
    if (await dao().getFund(input.organizationId))
      throw conflict(`${names.get(input.organizationId)} is already an own fund`);
    await dao().createFund(input.organizationId, input.maxHoldDays);
    return getFundOrThrow(input.organizationId);
  }),

  update: adminProcedure.input(fundUpdateInput).mutation(async ({ input }): Promise<Fund> => {
    await getFundOrThrow(input.organizationId);
    await dao().updateFund(input.organizationId, input.maxHoldDays);
    return getFundOrThrow(input.organizationId);
  }),

  /** CONFLICT once it has fund grants */
  delete: adminProcedure.input(fundByOrganization).mutation(async ({ input }) => {
    const fund = await getFundOrThrow(input.organizationId);
    await deleteOrConflict(
      () => dao().deleteFund(input.organizationId),
      `${fund.name} has fund grants; it stays an own fund`,
    );
    return { organizationId: input.organizationId };
  }),
});

const getHoldOrThrow = async (id: number) => {
  const hold = await dao().getHold(id);
  if (!hold) throw notFound(`Hold #${id} not found`);
  return hold;
};

/** Holds keep a recipient (or one project) out of proposals while active */
const holdsRouter = router({
  list: adminProcedure
    .input(holdListInput)
    .query(({ input }): Promise<Hold[]> => dao().listHolds(input ?? {})),

  create: adminProcedure.input(holdCreateInput).mutation(async ({ input, ctx }): Promise<Hold> => {
    await assertOrganizations([input.organizationId]);
    await assertProjects([input]);
    return getHoldOrThrow(await dao().createHold(input, adminIdentity(ctx.auth)));
  }),

  update: adminProcedure.input(holdUpdateInput).mutation(async ({ input }): Promise<Hold> => {
    const { id, ...changes } = input;
    const next = { ...(await getHoldOrThrow(id)), ...changes };
    await assertProjects([next]);
    await dao().updateHold(id, next);
    return getHoldOrThrow(id);
  }),

  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    if (!(await dao().deleteHold(input.id))) throw notFound(`Hold #${input.id} not found`);
    return { id: input.id };
  }),
});

//endregion

export const regrantingRouter = router({
  balances: balancesRouter,
  rounds: roundsRouter,
  transfers: transfersRouter,
  fundGrants: fundGrantsRouter,
  adjustments: adjustmentsRouter,
  documents: documentsRouter,
  payees: payeesRouter,
  routings: routingsRouter,
  projects: projectsRouter,
  funds: fundsRouter,
  holds: holdsRouter,
  statements: statementsRouter,
  reconciliation: reconciliationRouter,
});
