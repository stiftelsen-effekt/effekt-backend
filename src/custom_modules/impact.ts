import { Distribution } from "../schemas/types";
import { DAO } from "./DAO";
import {
  ImpactEvaluationsResponse,
  ImpactGrantResponse,
  getEvaluation,
  getMaximumImpactGrant,
} from "./results";
import { getExchangeRateForDate } from "./currency";

export const getImpactEstimatesForDonation = async (
  donationDate: Date,
  donationSum: number,
  distribution: Distribution,
): Promise<{ output: string; numberOfOutputs: number; roundedNumberOfOutputs: string }[]> => {
  const distributionOrgIds = distribution.causeAreas.flatMap((causeArea) =>
    causeArea.organizations.map((org) => org.id),
  );

  const orgs = await DAO.organizations.getByIDs(distributionOrgIds);

  const abbreviations = orgs.map((org) => org.abbriv).filter((abr) => abr !== "TCF");

  let evaluationsResponse: ImpactEvaluationsResponse;
  if (abbreviations.length > 0) {
    evaluationsResponse = await getEvaluation(abbreviations, donationDate);
  }

  let grantResponse: ImpactGrantResponse;
  if (orgs.some((org) => org.abbriv === "TCF")) {
    grantResponse = await getMaximumImpactGrant(donationDate);
  }

  let results: {
    output: string;
    numberOfOutputs: number;
  }[] = [];

  const allOrgsAndShares = distribution.causeAreas.flatMap((causeArea) =>
    causeArea.organizations.map((org) => ({
      abbriv: orgs.find((o) => o.ID === org.id).abbriv,
      share:
        (parseFloat(org.percentageShare) / 100) * (parseFloat(causeArea.percentageShare) / 100),
    })),
  );

  // Validate that the shares sum to 1
  if (allOrgsAndShares.reduce((acc, curr) => acc + curr.share, 0) !== 1) {
    throw new Error("Shares do not sum to 1");
  }

  const exchangeRate = await getExchangeRateForDate(donationDate);

  for (const { abbriv, share } of allOrgsAndShares) {
    if (abbriv === "TCF") {
      const totalGrantSumInCents = grantResponse.max_impact_fund_grants[0].allotment_set.reduce(
        (acc, curr) => acc + curr.sum_in_cents,
        0,
      );
      for (const allotment of grantResponse.max_impact_fund_grants[0].allotment_set) {
        const allotmentShare = allotment.sum_in_cents / totalGrantSumInCents;

        const existingResult = results.find(
          (result) => result.output === allotment.intervention.short_description,
        );

        const costPerOutputInCents = allotment.sum_in_cents / allotment.number_outputs_purchased;

        if (existingResult) {
          existingResult.numberOfOutputs +=
            ((donationSum / exchangeRate) * (share * allotmentShare)) /
            (costPerOutputInCents / 100);
        } else {
          results.push({
            output: allotment.intervention.short_description,
            numberOfOutputs:
              ((donationSum / exchangeRate) * (share * allotmentShare)) /
              (costPerOutputInCents / 100),
          });
        }
      }
    } else if (abbriv === "Drift") {
      results.push({
        output: "Drift",
        numberOfOutputs: donationSum * share,
      });
    } else {
      const evaluation = evaluationsResponse.evaluations.find(
        (evaluation) => evaluation.charity.abbreviation === abbriv,
      );
      if (evaluation) {
        const existingResult = results.find(
          (result) => result.output === evaluation.intervention.short_description,
        );
        if (existingResult) {
          existingResult.numberOfOutputs +=
            ((donationSum / exchangeRate) * share) / (evaluation.cents_per_output / 100);
        } else {
          results.push({
            output: evaluation.intervention.short_description,
            numberOfOutputs:
              ((donationSum / exchangeRate) * share) / (evaluation.cents_per_output / 100),
          });
        }
      }
    }
  }

  const lowest = Math.min(...results.map((result) => result.numberOfOutputs));

  // We are now going to round the number of outputs
  // Look at the lowest to determine the rounding, then round all the numbers
  // to the amount of decimals required to get the lowest number of outputs
  // We find the number of decimals by looking at how many decimals are needed
  // to not round to 0
  let decimals = 0;
  while (parseFloat(lowest.toFixed(decimals)) === 0 && decimals < 3) {
    decimals++;
  }

  return results.map((result) => ({
    ...result,
    roundedNumberOfOutputs: (
      Math.round(result.numberOfOutputs * Math.pow(10, decimals)) / Math.pow(10, decimals)
    )
      .toFixed(decimals)
      .replace(/\./, ","),
  }));
};

export type OrganizationImpactEstimate = {
  orgAbbriv: string;
  orgId: number;
  outputs: {
    output: string;
    numberOfOutputs: number;
    roundedNumberOfOutputs: string;
  }[];
};

export const getImpactEstimatesForDonationByOrg = async (
  donationDate: Date,
  donationSum: number,
  distribution: Distribution,
): Promise<OrganizationImpactEstimate[]> => {
  const distributionOrgIds = distribution.causeAreas.flatMap((causeArea) =>
    causeArea.organizations.map((org) => org.id),
  );

  const orgs = await DAO.organizations.getByIDs(distributionOrgIds);

  const abbreviations = orgs.map((org) => org.abbriv).filter((abr) => abr !== "TCF");

  let evaluationsResponse: ImpactEvaluationsResponse;
  if (abbreviations.length > 0) {
    evaluationsResponse = await getEvaluation(abbreviations, donationDate);
  }

  let grantResponse: ImpactGrantResponse;
  if (orgs.some((org) => org.abbriv === "TCF")) {
    grantResponse = await getMaximumImpactGrant(donationDate);
  }

  let results: {
    orgAbbriv: string;
    orgId: number;
    outputs: {
      output: string;
      numberOfOutputs: number;
      roundedNumberOfOutputs: string;
    }[];
  }[] = [];

  const allOrgsAndShares = distribution.causeAreas.flatMap((causeArea) =>
    causeArea.organizations.map((org) => ({
      abbriv: orgs.find((o) => o.ID === org.id).abbriv,
      share:
        (parseFloat(org.percentageShare) / 100) * (parseFloat(causeArea.percentageShare) / 100),
    })),
  );

  // Validate that the shares sum to 1
  const totalShare = allOrgsAndShares.reduce((acc, curr) => acc + curr.share, 0);
  if (Math.abs(totalShare - 1) > 0.0001) {
    throw new Error("Shares do not sum to 1");
  }

  const exchangeRate = await getExchangeRateForDate(donationDate);

  for (const { abbriv, share } of allOrgsAndShares) {
    let orgResult = results.find((result) => result.orgAbbriv === abbriv);
    if (!orgResult) {
      orgResult = {
        orgAbbriv: abbriv,
        orgId: orgs.find((org) => org.abbriv === abbriv).ID,
        outputs: [],
      };
      results.push(orgResult);
    }

    if (abbriv === "TCF") {
      const totalGrantSumInCents = grantResponse.max_impact_fund_grants[0].allotment_set.reduce(
        (acc, curr) => acc + curr.sum_in_cents,
        0,
      );
      for (const allotment of grantResponse.max_impact_fund_grants[0].allotment_set) {
        const allotmentShare = allotment.sum_in_cents / totalGrantSumInCents;
        const costPerOutputInCents = allotment.sum_in_cents / allotment.number_outputs_purchased;

        orgResult.outputs.push({
          output: allotment.intervention.short_description,
          numberOfOutputs:
            ((donationSum / exchangeRate) * (share * allotmentShare)) /
            (costPerOutputInCents / 100),
          roundedNumberOfOutputs: "",
        });
      }
    } else if (abbriv === "Drift") {
      orgResult.outputs.push({
        output: "Drift",
        numberOfOutputs: donationSum * share,
        roundedNumberOfOutputs: "",
      });
    } else {
      const evaluation = evaluationsResponse.evaluations.find(
        (evaluation) => evaluation.charity.abbreviation === abbriv,
      );
      if (evaluation) {
        orgResult.outputs.push({
          output: evaluation.intervention.short_description,
          numberOfOutputs:
            ((donationSum / exchangeRate) * share) / (evaluation.cents_per_output / 100),
          roundedNumberOfOutputs: "",
        });
      }
    }
  }

  // Flatten all outputs to determine the lowest number for rounding
  const allOutputsNumbers = results.flatMap((result) =>
    result.outputs.map((output) => output.numberOfOutputs),
  );

  const lowest = Math.min(...allOutputsNumbers);

  // Determine the number of decimals needed
  let decimals = 0;
  while (parseFloat(lowest.toFixed(decimals)) === 0 && decimals < 3) {
    decimals++;
  }

  // Round the numberOfOutputs for each output
  for (const result of results) {
    result.outputs = result.outputs.map((output) => ({
      ...output,
      roundedNumberOfOutputs: (
        Math.round(output.numberOfOutputs * Math.pow(10, decimals)) / Math.pow(10, decimals)
      )
        .toFixed(decimals)
        .replace(/\./, ","),
    }));
  }

  return results;
};
