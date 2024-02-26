import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { getBestExchangeRate, getExchangeRates } from "../custom_modules/currency";
import { getEvaluations, getMaximumImpactGrants } from "../custom_modules/results";

export const resultsRouter = Router();

resultsRouter.get("/donations/daily", async (req, res, next) => {
  try {
    let dailyDonations = await DAO.results.getDailyDonations();

    res.json({
      status: 200,
      content: dailyDonations,
    });
  } catch (ex) {
    next(ex);
  }
});

resultsRouter.get("/referrals/sums", async (req, res, next) => {
  try {
    let referralSums = await DAO.results.getReferralSums();

    res.json({
      status: 200,
      content: referralSums,
    });
  } catch (ex) {
    next(ex);
  }
});

type MonthlyDonationsPerOrgResult = {
  output: string;
  total: AggregatedOrgResult;
  monthly: AggregatedOrgResult[];
}[];

type AggregatedOrgResult = {
  period: string;
  numberOfOutputs: number;
  organizations: {
    [key: string]: {
      direct: {
        sum: number;
        numberOfOutputs: number;
      };
      smartDistribution: {
        sum: number;
        numberOfOutputs: number;
      };
    };
  }[];
};

resultsRouter.get("/donations/monthly/outputs", async (req, res, next) => {
  try {
    let donationSums = await DAO.results.getMonthlyDonationsPerOrg();

    const evaluations = await getEvaluations();
    const exchangeRates = await getExchangeRates();

    const directToOrgs = donationSums.filter((donationSum) => donationSum.Org !== "TCF");

    const result: MonthlyDonationsPerOrgResult = [];
    for (const donationSum of directToOrgs) {
      // Find first evaluation for the charity after the donation month
      const relevantEvaluation = evaluations.evaluations
        .filter(
          (e) =>
            e.charity.abbreviation.toLowerCase() === mapOrgToApi(donationSum.Org.toLowerCase()),
        )
        .sort((a, b) => {
          if (a.start_year === b.start_year) {
            return a.start_month - b.start_month;
          }
          return a.start_year - b.start_year;
        })
        .filter((evaluation, i, filtered) => {
          // Same year, same month or later
          if (
            evaluation.start_year === parseInt(donationSum.DonationMonth.split("-")[0]) &&
            evaluation.start_month >= parseInt(donationSum.DonationMonth.split("-")[1])
          ) {
            return true;
          }
          // Later year
          if (evaluation.start_year > parseInt(donationSum.DonationMonth.split("-")[0])) {
            return true;
          }
          // If last evaluation available for charity return true
          if (i === filtered.length - 1) {
            return true;
          }
        })[0];

      let output: string;
      let centsPerOutput: number;
      if (!relevantEvaluation) {
        output = "Kroner";
        centsPerOutput = 100;
      } else {
        output = relevantEvaluation.intervention.short_description;
        centsPerOutput = relevantEvaluation.cents_per_output;
      }

      const total = parseInt(donationSum.TotalDonations);
      const outputIndex = result.findIndex((r) => r.output === output);

      const exchangeRate = getBestExchangeRate(exchangeRates, donationSum.DonationMonth);
      const sumInCents = (total / exchangeRate) * 100;
      const org = donationSum.Org.toLowerCase();

      /** Output not in results yet */
      if (outputIndex === -1) {
        result.push({
          output,
          total: {
            period: "Total",
            numberOfOutputs: sumInCents / centsPerOutput,
            organizations: [
              {
                [org]: {
                  direct: {
                    sum: total,
                    numberOfOutputs: sumInCents / centsPerOutput,
                  },
                  smartDistribution: {
                    sum: 0,
                    numberOfOutputs: 0,
                  },
                },
              },
            ],
          },
          monthly: [
            {
              period: donationSum.DonationMonth,
              numberOfOutputs: sumInCents / centsPerOutput,
              organizations: [
                {
                  [org]: {
                    direct: {
                      sum: total,
                      numberOfOutputs: sumInCents / centsPerOutput,
                    },
                    smartDistribution: {
                      sum: 0,
                      numberOfOutputs: 0,
                    },
                  },
                },
              ],
            },
          ],
        });
        continue;
      }

      /** Output is in results, but we don't see the organization in the organizations array */
      /** Add the organization to the organizations array and update the totals */
      if (!result[outputIndex].total.organizations.find((o) => o[org])) {
        // Add to totals
        result[outputIndex].total.organizations.push({
          [org]: {
            direct: {
              sum: total,
              numberOfOutputs: sumInCents / centsPerOutput,
            },
            smartDistribution: {
              sum: 0,
              numberOfOutputs: 0,
            },
          },
        });
        result[outputIndex].total.numberOfOutputs += sumInCents / centsPerOutput;
      } else {
        // Update totals
        const orgIndex = result[outputIndex].total.organizations.findIndex((o) => o[org]);
        result[outputIndex].total.organizations[orgIndex][org].direct.sum += total;
        result[outputIndex].total.organizations[orgIndex][org].direct.numberOfOutputs +=
          sumInCents / centsPerOutput;
        result[outputIndex].total.numberOfOutputs += sumInCents / centsPerOutput;
      }

      // Add to monthly
      const periodIndex = result[outputIndex].monthly.findIndex(
        (m) => m.period === donationSum.DonationMonth,
      );
      if (periodIndex === -1) {
        result[outputIndex].monthly.push({
          period: donationSum.DonationMonth,
          numberOfOutputs: sumInCents / centsPerOutput,
          organizations: [
            {
              [org]: {
                direct: {
                  sum: total,
                  numberOfOutputs: sumInCents / centsPerOutput,
                },
                smartDistribution: {
                  sum: 0,
                  numberOfOutputs: 0,
                },
              },
            },
          ],
        });
      } else {
        result[outputIndex].monthly[periodIndex].organizations.push({
          [org]: {
            direct: {
              sum: total,
              numberOfOutputs: sumInCents / centsPerOutput,
            },
            smartDistribution: {
              sum: 0,
              numberOfOutputs: 0,
            },
          },
        });
        result[outputIndex].monthly[periodIndex].numberOfOutputs += sumInCents / centsPerOutput;
      }
    }

    const maximumImpactGrants = await getMaximumImpactGrants();
    const viaMaximumImpactGrants = donationSums.filter((donationSum) => donationSum.Org === "TCF");

    for (const donationSum of viaMaximumImpactGrants) {
      const relevantGrant = maximumImpactGrants.max_impact_fund_grants
        .sort((a, b) => {
          if (a.start_year === b.start_year) {
            return a.start_month - b.start_month;
          }
          return a.start_year - b.start_year;
        })
        .filter((grant, i, filtered) => {
          // Same year, same month or later
          if (
            grant.start_year === parseInt(donationSum.DonationMonth.split("-")[0]) &&
            grant.start_month >= parseInt(donationSum.DonationMonth.split("-")[1])
          ) {
            return true;
          }
          // Later year
          if (grant.start_year > parseInt(donationSum.DonationMonth.split("-")[0])) {
            return true;
          }
          // If last grant available retyrb trye
          if (i === filtered.length - 1) {
            return true;
          }
        })[0];

      for (const allotment of relevantGrant.allotment_set) {
        const output = allotment.intervention.short_description;
        const centsPerOutput = allotment.sum_in_cents / allotment.number_outputs_purchased;
        const total = parseFloat(donationSum.TotalDonations);
        const outputIndex = result.findIndex((r) => r.output === output);

        const exchangeRate = getBestExchangeRate(exchangeRates, donationSum.DonationMonth);
        const sumInCents = (total / exchangeRate) * 100;

        const org = mapApiToOrg(allotment.charity.abbreviation.toLowerCase());

        /** Output not in results yet */
        if (outputIndex === -1) {
          result.push({
            output,
            total: {
              period: "Total",
              numberOfOutputs: sumInCents / centsPerOutput,
              organizations: [
                {
                  [org]: {
                    direct: {
                      sum: 0,
                      numberOfOutputs: 0,
                    },
                    smartDistribution: {
                      sum: total,
                      numberOfOutputs: sumInCents / centsPerOutput,
                    },
                  },
                },
              ],
            },
            monthly: [
              {
                period: donationSum.DonationMonth,
                numberOfOutputs: sumInCents / centsPerOutput,
                organizations: [
                  {
                    [org]: {
                      direct: {
                        sum: 0,
                        numberOfOutputs: 0,
                      },
                      smartDistribution: {
                        sum: total,
                        numberOfOutputs: sumInCents / centsPerOutput,
                      },
                    },
                  },
                ],
              },
            ],
          });
          continue;
        }

        /** Output is in results, but we don't see the organization in the organizations array */
        /** Add the organization to the organizations array and update the totals */
        if (!result[outputIndex].total.organizations.find((o) => o[org])) {
          // Add to totals
          result[outputIndex].total.organizations.push({
            [org]: {
              direct: {
                sum: 0,
                numberOfOutputs: 0,
              },
              smartDistribution: {
                sum: total,
                numberOfOutputs: sumInCents / centsPerOutput,
              },
            },
          });
          result[outputIndex].total.numberOfOutputs += sumInCents / centsPerOutput;
        } else {
          // Update totals
          const orgIndex = result[outputIndex].total.organizations.findIndex((o) => o[org]);
          result[outputIndex].total.organizations[orgIndex][org].smartDistribution.sum += total;
          result[outputIndex].total.organizations[orgIndex][
            org
          ].smartDistribution.numberOfOutputs += sumInCents / centsPerOutput;
          result[outputIndex].total.numberOfOutputs += sumInCents / centsPerOutput;
        }

        // Add to monthly
        const periodIndex = result[outputIndex].monthly.findIndex(
          (m) => m.period === donationSum.DonationMonth,
        );
        if (periodIndex === -1) {
          result[outputIndex].monthly.push({
            period: donationSum.DonationMonth,
            numberOfOutputs: sumInCents / centsPerOutput,
            organizations: [
              {
                [org]: {
                  direct: {
                    sum: 0,
                    numberOfOutputs: 0,
                  },
                  smartDistribution: {
                    sum: total,
                    numberOfOutputs: sumInCents / centsPerOutput,
                  },
                },
              },
            ],
          });
        } else {
          result[outputIndex].monthly[periodIndex].organizations.push({
            [org]: {
              direct: {
                sum: 0,
                numberOfOutputs: 0,
              },
              smartDistribution: {
                sum: total,
                numberOfOutputs: sumInCents / centsPerOutput,
              },
            },
          });
          result[outputIndex].monthly[periodIndex].numberOfOutputs += sumInCents / centsPerOutput;
        }
      }
    }

    res.json({
      status: 200,
      content: result,
    });
  } catch (ex) {
    next(ex);
  }
});

const mapOrgToApi = (org: string) => {
  if (org === "sight") {
    return "ss";
  }
  return org;
};

const mapApiToOrg = (org: string) => {
  if (org === "ss") {
    return "sight";
  }
  return org;
};
