export type ImpactGrantResponse = {
  max_impact_fund_grants: ImpactGrant[];
};

export type ImpactEvaluationsResponse = {
  evaluations: ImpactEvaluation[];
};

type ImpactIntervention = {
  long_description: string;
  short_description: string;
  id: number;
};

type ImpactCharity = {
  id: number;
  charity_name: string;
  abbreviation: string;
};

type ImpactAllotment = {
  id: number;
  intervention: ImpactIntervention;
  converted_sum: number;
  currency: string;
  converted_cost_per_output: number;
  exchange_rate_date: string;
  sum_in_cents: number;
  number_outputs_purchased: number;
  number_outputs_purchased_lower_bound: number;
  number_outputs_purchased_upper_bound: number | null;
  source_name: string;
  source_url: string;
  comment: string;
  charity: ImpactCharity;
};

type ImpactGrant = {
  id: number;
  allotment_set: ImpactAllotment[];
  language: string;
  start_year: number;
  start_month: number;
};

type ImpactEvaluation = {
  id: number;
  intervention: ImpactIntervention;
  converted_cost_per_output: number;
  exchange_rate_date: string;
  currency: string;
  language: string;
  start_year: number;
  start_month: number;
  cents_per_output: number;
  cents_per_output_upper_bound: number | null;
  cents_per_output_lower_bound: number;
  source_name: string;
  source_url: string;
  comment: string;
  charity: ImpactCharity;
};

export const getEvaluations = async () => {
  const evaluationsResult = await fetch(
    `https://impact.gieffektivt.no/api/evaluations?language=NO`,
  );
  const evaluations: ImpactEvaluationsResponse = await evaluationsResult.json();
  return evaluations;
};

export const getMaximumImpactGrants = async () => {
  const maxImpactFundGrantsResult = await fetch(
    `https://impact.gieffektivt.no/api/max_impact_fund_grants?language=NO`,
  );
  const maxImpactFundGrants: ImpactGrantResponse = await maxImpactFundGrantsResult.json();
  return maxImpactFundGrants;
};
