import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import { buildOverview } from "../../custom_modules/DAO_modules/analysis";
import type { Pledge, PledgeInput } from "../../custom_modules/DAO_modules/pledges";
import {
  pledgeByIdInput,
  pledgeCreateInput,
  pledgeMarkReceivedInput,
  pledgeUpdateInput,
} from "../schemas/analysis";
import { adminProcedure, router } from "../trpc";

/**
 * Analysis for the admin: the overview (collected this year, through time, open pledges) and
 * pledges (tilsagn). Pledges are a separate layer on top of the measured totals and are never
 * mixed into them. Same rules as Nicolai's REST endpoints (GET /analysis/overview,
 * /analysis/pledges), reusing his DAO modules.
 *
 * Money is returned as decimal strings, like the rest of the API. The overview's totals are
 * whole kroner (buildOverview rounds them), so they read e.g. "171237465".
 */

export type AnalysisOverview = {
  thisYear: { year: number; sum: string };
  throughTime: {
    /** Passed on to the recipients since the start, excluding the Drift share; incl. Influenced */
    measured: string;
    donations: number;
    /** The first donation's date (YYYY-MM-DD), null without donations */
    from: string | null;
  };
  /** Open pledges (not received yet) */
  pledges: { open: string; count: number };
  /** measured + open pledges, and the distance to the milestone */
  withPledges: { sum: string; milestone: string; remaining: string; passed: boolean };
};

export type PledgeRow = {
  id: number;
  /** Decimal string with two decimals */
  sum: string;
  decidedDate: string;
  /** Null while the pledge is open */
  receivedDate: string | null;
  donationId: number | null;
};

const toPledgeRow = (pledge: Pledge): PledgeRow => ({ ...pledge, sum: pledge.sum.toFixed(2) });

const findPledge = async (id: number): Promise<Pledge> => {
  const pledge = await DAO.pledges.getById(id);
  if (!pledge) throw new TRPCError({ code: "NOT_FOUND", message: `Pledge ${id} not found` });
  return pledge;
};

const assertDonationExists = async (donationId: number | null) => {
  if (donationId !== null && !(await DAO.pledges.donationExists(donationId))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Donation ${donationId} does not exist`,
    });
  }
};

/** Writes the whole pledge and returns it as stored */
const save = async (id: number, input: PledgeInput): Promise<PledgeRow> => {
  if (!(await DAO.pledges.update(id, input))) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Pledge ${id} not found` });
  }
  return toPledgeRow(await findPledge(id));
};

const inputOf = (pledge: Pledge): PledgeInput => ({
  sum: pledge.sum,
  decidedDate: pledge.decidedDate,
  receivedDate: pledge.receivedDate,
  donationId: pledge.donationId,
});

const pledgesRouter = router({
  /** All pledges, open first, then the most recently decided */
  list: adminProcedure.query(
    async (): Promise<PledgeRow[]> => (await DAO.pledges.getAll()).map(toPledgeRow),
  ),

  get: adminProcedure
    .input(pledgeByIdInput)
    .query(async ({ input }): Promise<PledgeRow> => toPledgeRow(await findPledge(input.id))),

  /** A new pledge, usually open (sum + decidedDate). Returns it as stored. */
  create: adminProcedure.input(pledgeCreateInput).mutation(async ({ input }) => {
    await assertDonationExists(input.donationId);
    const id = await DAO.pledges.add(input);
    return toPledgeRow(await findPledge(id));
  }),

  /** Changes the amount (lowered to what remains after a partial payment) or decision date */
  update: adminProcedure.input(pledgeUpdateInput).mutation(async ({ input }) => {
    const pledge = await findPledge(input.id);
    return save(input.id, {
      ...inputOf(pledge),
      sum: input.sum ?? pledge.sum,
      decidedDate: input.decidedDate ?? pledge.decidedDate,
    });
  }),

  /**
   * The money came in: the pledge stops counting as open (the donation counts as measured).
   * Register the donation first and link it here, so the amount isn't counted twice.
   */
  markReceived: adminProcedure.input(pledgeMarkReceivedInput).mutation(async ({ input }) => {
    const pledge = await findPledge(input.id);
    await assertDonationExists(input.donationId);
    return save(input.id, {
      ...inputOf(pledge),
      receivedDate: input.receivedDate,
      donationId: input.donationId,
    });
  }),

  /** Undoes markReceived: open again, without a linked donation */
  reopen: adminProcedure.input(pledgeByIdInput).mutation(async ({ input }) => {
    const pledge = await findPledge(input.id);
    return save(input.id, { ...inputOf(pledge), receivedDate: null, donationId: null });
  }),

  /** A pledge that fell through. Returns the deleted id. */
  delete: adminProcedure.input(pledgeByIdInput).mutation(async ({ input }) => {
    if (!(await DAO.pledges.remove(input.id))) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Pledge ${input.id} not found` });
    }
    return { id: input.id };
  }),
});

export const analysisRouter = router({
  /** Same numbers as GET /analysis/overview in Nicolai's backend PR #825 */
  overview: adminProcedure.query(async (): Promise<AnalysisOverview> => {
    const { thisYear, throughTime, pledges, withPledges } = buildOverview(
      await DAO.analysis.getOverviewTotals(),
    );
    return {
      thisYear: { year: thisYear.year, sum: String(thisYear.sum) },
      throughTime: {
        measured: String(throughTime.measured),
        donations: throughTime.donations,
        from: throughTime.from,
      },
      pledges: { open: String(pledges.open), count: pledges.count },
      withPledges: {
        sum: String(withPledges.sum),
        milestone: String(withPledges.milestone),
        remaining: String(withPledges.remaining),
        passed: withPledges.passed,
      },
    };
  }),

  pledges: pledgesRouter,
});
