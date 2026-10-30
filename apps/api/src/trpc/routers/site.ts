import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import { getRecentLtvEstimates } from "../../custom_modules/ltv";
import { getMonthlyDonationsPerOutput } from "../../custom_modules/monthlyOutputs";
import { publicProcedure, router } from "../trpc";
import {
  siteDailyDonationsOutput,
  siteFundraiserInput,
  siteFundraiserOutput,
  siteLtvEstimateOutput,
  siteMonthlyOutputsOutput,
  siteOrganizationsOutput,
  siteReferralSumsOutput,
  siteResultsHeadlineOutput,
} from "../shared/site";

/**
 * Public reads for the website outside the donation widget (no login): the results page and
 * teaser, fundraiser pages, the lifetime value estimate and the organizations Min Side names. Each runs the same DAO or service
 * call as its REST route; the REST routes stay for the Danish site, Sanity Studio and older
 * clients. None of the REST routes is cached (no apicache), so neither are these.
 */
export const siteRouter = router({
  /** GET /results/headline */
  resultsHeadline: publicProcedure
    .output(siteResultsHeadlineOutput)
    .query(() => DAO.results.getHeadlineFigures()),

  /** GET /results/donations/daily */
  dailyDonations: publicProcedure
    .output(siteDailyDonationsOutput)
    .query(() => DAO.results.getDailyDonations()),

  /** GET /results/referrals/sums */
  referralSums: publicProcedure
    .output(siteReferralSumsOutput)
    .query(() => DAO.results.getReferralSums()),

  /** GET /results/donations/monthly/outputs */
  monthlyOutputs: publicProcedure
    .output(siteMonthlyOutputsOutput)
    .query(() => getMonthlyDonationsPerOutput()),

  /** GET /ltv/recentestimate */
  ltvEstimate: publicProcedure.output(siteLtvEstimateOutput).query(async () => {
    const estimates = await getRecentLtvEstimates();
    if (!estimates) throw new TRPCError({ code: "NOT_FOUND", message: "No LTV estimate found" });
    return estimates;
  }),

  /** GET /organizations/all (Min Side's donation list and charts) */
  organizations: publicProcedure
    .output(siteOrganizationsOutput)
    .query(() => DAO.organizations.getAll()),

  /** GET /fundraisers/:id */
  fundraiser: publicProcedure
    .input(siteFundraiserInput)
    .output(siteFundraiserOutput)
    .query(async ({ input }) => {
      const fundraiser = await DAO.fundraisers.getFundraiserByID(input.id);
      if (!fundraiser) throw new TRPCError({ code: "NOT_FOUND", message: "Fundraiser not found" });
      return fundraiser;
    }),
});
