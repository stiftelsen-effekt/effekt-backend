import type { RouterOutputs } from "./lib/trpc/client";

/*
 * Min Side's data, as the procedures' output schemas (apps/api/src/trpc/shared/minside.ts) return
 * it, on every site: the Danish REST link validates with the same schemas.
 */
type Minside = RouterOutputs["minside"];
export type Donation = Minside["donations"][number];
/** One entry of a Danish donation's precomputed impact */
export type DonationImpactEntry = NonNullable<Donation["impact"]>[number];
export type AvtaleGiroAgreement = Minside["avtaleGiroAgreements"][number];
export type VippsAgreement = Minside["vippsAgreements"][number];
export type Distribution = Minside["distributions"][number];
export type DistributionCauseArea = Distribution["causeAreas"][number];
export type Donor = Minside["profile"];
export type AggregatedDonations = Minside["donationsAggregated"][number];
export type TaxUnit = Minside["taxUnits"][number];
export type TaxYearlyReport = Minside["taxReports"][number];
export type TaxYearlyReportUnits = TaxYearlyReport["units"][number];

export enum META_OWNER {
  EFFEKT = 1,
  EAN = 2,
  EFFEKTANDEAN = 3,
}

export type DKPaymentMethod = "MobilePay" | "Credit card" | "Bank transfer";

export type DKAgreement = {
  id: string;
  kid: string;
  bank_msg: string;
  membershipDisplayName?: string | null;
  cancelled: boolean;
  amount: number;
  chargeDay: number | null;
  createdAt: string;
  method: DKPaymentMethod;
  is_payment_expired: boolean;
};

export type DonationGraphData = {
  name: string;
};

export type SEOMeta = {
  title: string;
  titleTemplate?: string;
  description: string;
  imageAssetUrl?: string | null;
  canonicalurl?: string;
  keywords?: string;
  siteName: string;
  noIndex?: boolean;
};

export type ImpactCharity = {
  id: number; // Not necessarily the same as the id in the database
  charity_name: string;
  abbreviation: string;
};

export type ImpactIntervention = {
  long_description: string;
  short_description: string;
  id: number;
};

export type ImpactEvaluation = {
  id: number;
  intervention: ImpactIntervention;
  converted_cost_per_output: number;
  currency: string;
  language: string;
  start_year: number;
  start_month: number;
  cents_per_output: number;
  charity: ImpactCharity;
};

export type GiveWellGrant = {
  id: number;
  allotment_set: {
    id: number;
    intervention: ImpactIntervention;
    converted_sum: number;
    currency: string;
    converted_cost_per_output: number;
    exchange_rate_date: string;
    sum_in_cents: number;
    number_outputs_purchased: number;
    charity: ImpactCharity;
  }[];
  language: string;
  start_year: number;
  start_month: number;
};
