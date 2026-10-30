import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import type {
  AllocationInput,
  AssumedLine,
} from "../../custom_modules/DAO_modules/regrantingOnward";
import { fmt, sum } from "../../custom_modules/regranting/money";
import {
  checkAllocation,
  onwardFigures,
  prefillForwarded,
} from "../../custom_modules/regranting/onward";
import type {
  ExternalGrantee,
  IntermediaryPayee,
  Money,
  OnwardAllocation,
  OnwardLine,
  OnwardLineRef,
  OnwardReport,
  RegrantingFund,
} from "../../custom_modules/regranting/types";
import { adminIdentity } from "../identity";
import {
  allocationCreateInput,
  allocationUpdateInput,
  byId,
  granteeCreateInput,
  granteeUpdateInput,
  onwardAssumeInput,
  onwardAwaitingInput,
  onwardLineInput,
  onwardReportCreateInput,
  onwardReportListInput,
  onwardReportUpdateInput,
  onwardTransferInput,
} from "../schemas/regranting";
import { adminProcedure, router } from "../trpc";

export type {
  ExternalGrantee,
  IntermediaryPayee,
  OnwardAllocation,
  OnwardLine,
  OnwardReport,
  RegrantingFund,
};

/**
 * Downstream regrants (docs/regranting-downstream.md): what an intermediary payee (GiveWell) did
 * with our transfer lines. Documentation beside the ledger, like documents: allowed in any round
 * status once the transfer is paid, and never changes a balance, a round or a transfer.
 */

type ForwardedPrefill = ReturnType<typeof prefillForwarded>;

const dao = () => DAO.regrantingOnward;
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const notFound = (message: string) => new TRPCError({ code: "NOT_FOUND", message });
const conflict = (message: string, cause?: unknown) =>
  new TRPCError({ code: "CONFLICT", message, cause });

const deleteOrConflict = async (run: () => Promise<boolean>, message: string) => {
  try {
    return await run();
  } catch (err) {
    if ((err as { errno?: unknown })?.errno === 1451) throw conflict(message, err);
    throw err;
  }
};

/** Lines with their allocations and calculated onward figures */
async function withAllocations(lines: OnwardLineRef[]): Promise<OnwardLine[]> {
  const allocations = await dao().listAllocations({ lineIds: lines.map((l) => l.id) });
  return lines.map((line) => {
    const own = allocations.filter((a) => a.transferLineId === line.id);
    return { ...line, ...onwardFigures(line.amountNok, own), allocations: own };
  });
}

const getLineOrThrow = async (id: number) => {
  const line = await dao().getLine(id);
  if (!line) throw notFound(`Transfer line #${id} not found`);
  return line;
};

const getOnwardLine = async (id: number) => (await withAllocations([await getLineOrThrow(id)]))[0]!;

type AllocationFields = Omit<z.output<typeof allocationCreateInput>, "transferLineId">;

/**
 * Looks up what the rules need, runs them, and returns what to store plus the warnings. Throws
 * BAD_REQUEST with every error.
 */
async function validated(
  line: OnwardLineRef,
  input: AllocationFields,
  exceptId?: number,
): Promise<{ values: AllocationInput; warnings: string[] }> {
  if (input.organizationId !== null) {
    const exists = await DAO.regranting.organizationExists(input.organizationId);
    if (!exists) throw badRequest(`Recipient #${input.organizationId} doesn't exist`);
  }
  if (input.externalGranteeId !== null && !(await dao().getGrantee(input.externalGranteeId)))
    throw badRequest(`External grantee #${input.externalGranteeId} doesn't exist`);
  const report = input.reportId === null ? null : await dao().getReport(input.reportId);
  if (input.reportId !== null && !report)
    throw badRequest(`Onward report #${input.reportId} doesn't exist`);
  const owners =
    input.projectId === null
      ? new Map<number, number>()
      : await DAO.regranting.getProjectOrganizations([input.projectId]);
  if (input.projectId !== null && !owners.has(input.projectId))
    throw badRequest(`Project #${input.projectId} doesn't exist`);

  const others = (await dao().listAllocations({ lineIds: [line.id] })).filter(
    (a) => a.id !== exceptId,
  );
  const check = checkAllocation(
    line,
    {
      ...input,
      amountNok: input.amountNok === null ? null : fmt(sum([String(input.amountNok)])),
      projectOrganizationId: input.projectId === null ? null : owners.get(input.projectId)!,
      reportPayeeId: report?.payeeId ?? null,
    },
    others,
  );
  if (check.errors.length || check.amountNok === null)
    throw badRequest(check.errors.join(". ") || "Enter the amount");
  return {
    values: {
      ...input,
      transferLineId: line.id,
      amountNok: check.amountNok,
    },
    warnings: check.warnings,
  };
}

type AllocationResult = {
  allocation: OnwardAllocation;
  /** Rules that didn't block the save (docs/regranting-downstream.md › Validation) */
  warnings: string[];
  line: OnwardLine;
};

const allocationsRouter = router({
  /** Records (part of) a paid line as sent onward by the intermediary, or retained by it */
  create: adminProcedure
    .input(allocationCreateInput)
    .mutation(async ({ input, ctx }): Promise<AllocationResult> => {
      const { transferLineId, ...fields } = input;
      const line = await getLineOrThrow(transferLineId);
      const { values, warnings } = await validated(line, fields);
      const id = await dao().createAllocation(values, adminIdentity(ctx.auth));
      return {
        allocation: (await dao().getAllocation(id))!,
        warnings,
        line: await getOnwardLine(line.id),
      };
    }),

  update: adminProcedure
    .input(allocationUpdateInput)
    .mutation(async ({ input, ctx }): Promise<AllocationResult> => {
      const { id, ...fields } = input;
      const existing = await dao().getAllocation(id);
      if (!existing) throw notFound(`Onward allocation #${id} not found`);
      const line = await getLineOrThrow(existing.transferLineId);
      const { values, warnings } = await validated(line, fields, id);
      await dao().updateAllocation(id, values, adminIdentity(ctx.auth));
      return {
        allocation: (await dao().getAllocation(id))!,
        warnings,
        line: await getOnwardLine(line.id),
      };
    }),

  /** Also how an `assumed` entry is replaced once the intermediary reports */
  delete: adminProcedure.input(byId).mutation(async ({ input }): Promise<{ line: OnwardLine }> => {
    const existing = await dao().getAllocation(input.id);
    if (!existing) throw notFound(`Onward allocation #${input.id} not found`);
    await dao().deleteAllocation(input.id);
    return { line: await getOnwardLine(existing.transferLineId) };
  }),
});

const reportsRouter = router({
  /** Newest first, with their documents and allocation totals */
  list: adminProcedure
    .input(onwardReportListInput)
    .query(({ input }): Promise<OnwardReport[]> => dao().listReports(input ?? {})),

  /** The report, its documents, and its allocations with the lines they belong to */
  get: adminProcedure.input(byId).query(
    async ({
      input,
    }): Promise<{
      report: OnwardReport;
      allocations: (OnwardAllocation & { line: OnwardLineRef })[];
    }> => {
      const report = await dao().getReport(input.id);
      if (!report) throw notFound(`Onward report #${input.id} not found`);
      const allocations = await dao().listAllocations({ reportId: report.id });
      const lines = new Map<number, OnwardLineRef>();
      for (const lineId of new Set(allocations.map((a) => a.transferLineId))) {
        const line = await dao().getLine(lineId);
        if (line) lines.set(lineId, line);
      }
      return {
        report,
        allocations: allocations.map((a) => ({ ...a, line: lines.get(a.transferLineId)! })),
      };
    },
  ),

  create: adminProcedure
    .input(onwardReportCreateInput)
    .mutation(async ({ input, ctx }): Promise<OnwardReport> => {
      await assertIntermediary(input.payeeId);
      const id = await dao().createReport(input, adminIdentity(ctx.auth));
      return (await dao().getReport(id))!;
    }),

  update: adminProcedure
    .input(onwardReportUpdateInput)
    .mutation(async ({ input }): Promise<OnwardReport> => {
      const { id, ...changes } = input;
      const report = await dao().getReport(id);
      if (!report) throw notFound(`Onward report #${id} not found`);
      const next = { ...report, ...changes };
      if (next.payeeId !== report.payeeId) {
        await assertIntermediary(next.payeeId);
        if (report.allocationCount > 0)
          throw conflict("The report has allocations; it stays with its payee");
      }
      await dao().updateReport(id, next);
      return (await dao().getReport(id))!;
    }),

  /** CONFLICT while allocations point at it; its document links are removed with it */
  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    const report = await dao().getReport(input.id);
    if (!report) throw notFound(`Onward report #${input.id} not found`);
    await deleteOrConflict(
      () => dao().deleteReport(input.id),
      `The report has ${report.allocationCount} allocations; delete or move them first`,
    );
    return { id: input.id };
  }),
});

async function assertIntermediary(payeeId: number) {
  const intermediaries = await dao().listIntermediaries();
  if (!intermediaries.some((i) => i.payeeId === payeeId))
    throw badRequest(`Payee #${payeeId} isn't an intermediary payee`);
}

const granteesRouter = router({
  list: adminProcedure.query((): Promise<ExternalGrantee[]> => dao().listGrantees()),

  /** Only for grantees that aren't our recipients. CONFLICT on a duplicate name. */
  create: adminProcedure
    .input(granteeCreateInput)
    .mutation(async ({ input, ctx }): Promise<ExternalGrantee> => {
      if (await dao().getGranteeByName(input.name))
        throw conflict(`${input.name} is already an external grantee`);
      const id = await dao().createGrantee(input, adminIdentity(ctx.auth));
      return (await dao().getGrantee(id))!;
    }),

  update: adminProcedure
    .input(granteeUpdateInput)
    .mutation(async ({ input }): Promise<ExternalGrantee> => {
      const { id, ...changes } = input;
      const grantee = await dao().getGrantee(id);
      if (!grantee) throw notFound(`External grantee #${id} not found`);
      const next = { ...grantee, ...changes };
      const sameName = await dao().getGranteeByName(next.name);
      if (sameName && sameName.id !== id)
        throw conflict(`${next.name} is already an external grantee`);
      await dao().updateGrantee(id, next);
      return (await dao().getGrantee(id))!;
    }),

  /** CONFLICT while allocations point at it */
  delete: adminProcedure.input(byId).mutation(async ({ input }) => {
    const grantee = await dao().getGrantee(input.id);
    if (!grantee) throw notFound(`External grantee #${input.id} not found`);
    await deleteOrConflict(
      () => dao().deleteGrantee(input.id),
      `${grantee.name} has allocations; re-point or delete them first`,
    );
    return { id: input.id };
  }),
});

export type AwaitingGroup = {
  payeeId: number;
  payeeName: string;
  /** Σ awaiting over the lines: nothing entered yet */
  awaitingNok: Money;
  /** Σ assumed over the lines: backfilled, not confirmed by the intermediary */
  assumedNok: Money;
  /** Oldest payment first */
  lines: OnwardLine[];
};

export const onwardRouter = router({
  /** Which payees are intermediaries and which recipients are regranting funds */
  settings: adminProcedure.query(
    async (): Promise<{
      intermediaries: IntermediaryPayee[];
      regrantingFunds: RegrantingFund[];
    }> => {
      const [intermediaries, regrantingFunds] = await Promise.all([
        dao().listIntermediaries(),
        dao().listRegrantingFunds(),
      ]);
      return { intermediaries, regrantingFunds };
    },
  ),

  /**
   * A transfer's lines with their onward status and allocations. `intermediary` false (lines
   * empty): its payee keeps what it gets, so its lines need no onward records.
   */
  transfer: adminProcedure.input(onwardTransferInput).query(
    async ({
      input,
    }): Promise<{
      transferId: number;
      intermediary: boolean;
      paid: boolean;
      lines: (OnwardLine & { forwardedPrefill: ForwardedPrefill | null })[];
    }> => {
      const lines = await dao().getTransferLines(input.transferId);
      if (lines.length === 0) {
        const transfer = await DAO.regranting.getTransfer(input.transferId);
        if (!transfer) throw notFound(`Transfer #${input.transferId} not found`);
        return {
          transferId: input.transferId,
          intermediary: false,
          paid: !!transfer.paidAt,
          lines: [],
        };
      }
      const intermediary = lines[0]!.intermediary;
      return {
        transferId: input.transferId,
        intermediary,
        paid: !!lines[0]!.paidAt,
        lines: intermediary
          ? (await withAllocations(lines)).map((line) => ({
              ...line,
              // "Confirm forwarded" on pass-through lines with something awaiting
              forwardedPrefill:
                !line.regrantingFund && Number(line.awaitingNok) > 0
                  ? prefillForwarded(line, line.awaitingNok)
                  : null,
            }))
          : [],
      };
    },
  ),

  /** One line with its onward status and allocations */
  line: adminProcedure
    .input(onwardLineInput)
    .query(({ input }): Promise<OnwardLine> => getOnwardLine(input.transferLineId)),

  /**
   * "Confirm forwarded": the allocation to propose for a pass-through line — its own recipient
   * and project, what's still awaiting, in our transfer's currency. Ops adds the date and report.
   */
  prefill: adminProcedure.input(onwardLineInput).query(async ({ input }) => {
    const line = await getOnwardLine(input.transferLineId);
    if (line.regrantingFund)
      throw badRequest(
        `${line.organizationName} regrants by its own decision; add its grants one by one`,
      );
    return prefillForwarded(line, line.awaitingNok);
  }),

  /**
   * Paid lines to intermediary payees with something not reported, grouped by payee, oldest
   * payment first. Lines with only assumed allocations are included (status forwarded_assumed).
   */
  awaiting: adminProcedure
    .input(onwardAwaitingInput)
    .query(async ({ input }): Promise<AwaitingGroup[]> => {
      const lines = await withAllocations(await dao().getUnreportedLines(input ?? {}));
      const groups = new Map<number, AwaitingGroup>();
      for (const line of lines) {
        const group = groups.get(line.payeeId) ?? {
          payeeId: line.payeeId,
          payeeName: line.payeeName,
          awaitingNok: "0.00",
          assumedNok: "0.00",
          lines: [],
        };
        group.lines.push(line);
        group.awaitingNok = fmt(sum([group.awaitingNok, line.awaitingNok]));
        group.assumedNok = fmt(sum([group.assumedNok, line.assumedNok]));
        groups.set(line.payeeId, group);
      }
      return [...groups.values()].sort((a, b) => a.payeeName.localeCompare(b.payeeName));
    }),

  /**
   * Backfill: one `assumed` allocation (in full, to the line's recipient, forwarded on our
   * paid_at) for every paid pass-through line to an intermediary payee with no allocation yet,
   * optionally only lines paid from/to (inclusive) or to one payee. Never touches regranting-fund
   * lines. Idempotent: a second run creates nothing. `dryRun` lists what it would create.
   */
  assume: adminProcedure
    .input(onwardAssumeInput)
    .mutation(
      async ({
        input,
        ctx,
      }): Promise<{ dryRun: boolean; created: number; totalNok: Money; lines: AssumedLine[] }> => {
        const lines = await DAO.regranting.inTransaction((conn) =>
          dao().assumeMissing(conn, input, adminIdentity(ctx.auth)),
        );
        return {
          dryRun: input.dryRun,
          created: input.dryRun ? 0 : lines.length,
          totalNok: fmt(sum(lines.map((l) => l.amountNok))),
          lines,
        };
      },
    ),

  allocations: allocationsRouter,
  reports: reportsRouter,
  grantees: granteesRouter,
});
