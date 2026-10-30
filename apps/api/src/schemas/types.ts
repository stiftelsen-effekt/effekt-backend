// Shared domain types for the DAO layer. These used to be generated from the OpenAPI
// specs (src/specs/*.yaml via openapi-typescript); they are now maintained here directly.

export type Donor = {
  id: number;
  email: string;
  name: string;
  newsletter?: boolean;
  trash?: boolean;
  registered?: string;
};

export type TaxUnit = {
  id: number;
  donorId: number;
  name: string;
  ssn?: string;
  registered?: string;
  archived?: string | null;
  sumDonations?: string;
  numDonations?: number;
  taxDeductions?: {
    year?: number;
    sumDonations?: number;
    deduction?: number;
    benefit?: number;
  }[];
};

export type Distribution = {
  kid: string;
  donorId: number;
  taxUnitId: number | null;
  fundraiserTransactionId?: number | null;
  causeAreas: DistributionCauseArea[];
};

export type DistributionCauseArea = {
  id: number;
  name?: string;
  standardSplit: boolean;
  percentageShare: string;
  organizations: DistributionCauseAreaOrganization[];
};

export type DistributionCauseAreaOrganization = {
  id: number;
  name?: string;
  widgetDisplayName?: string;
  percentageShare: string;
};

export type DistributionInput = {
  donorId: number;
  taxUnitId: number | null;
  fundraiserId?: number;
  causeAreas: DistributionCauseArea[];
};

export type CauseArea = {
  id: number;
  name: string;
  widgetDisplayName?: string | null;
  widgetContext?: string | null;
  standardPercentageShare?: number | null;
  shortDescription: string | null;
  longDescription: string | null;
  informationUrl: string | null;
  isActive: boolean;
  ordering: number | null;
};

export type Organization = {
  id: number;
  causeAreaId: number;
  standardShare?: number | null;
  name: string;
  widgetDisplayName?: string | null;
  widgetContext?: string | null;
  abbreviation?: string;
  shortDescription?: string | null;
  longDescription?: string;
  informationUrl?: string | null;
  isActive: boolean;
  ordering: number | null;
  chartColor?: string | null;
};

export type Donation = {
  id?: number;
  donor?: string;
  donorId?: number;
  email?: string;
  sum: string;
  transactionCost?: string;
  paymentMethod?: string;
  KID: string;
  taxUnitId?: number;
  timestamp?: string;
  metaOwnerId?: number;
};

export type Fundraiser = {
  id: number;
  permalink: string;
  title?: string;
  description?: string;
  goal?: number;
  end?: string;
};

export type TaxReport = {
  year: number;
  units: TaxYearlyReportUnit[];
  sumDonationsWithoutTaxUnit: {
    sumDonations: number;
    channels: {
      channel: string;
      sumDonations: number;
    }[];
  };
  sumNonDeductibleDonationsByType: {
    type: string;
    sumNonDeductibleDonations: number;
  }[];
  sumTaxDeductions: number;
  sumDonations: number;
};

export type TaxYearlyReportUnit = {
  id: number;
  name: string;
  ssn: string;
  sumDonations: number;
  taxDeduction: number;
  channels: {
    channel: string;
    sumDonations: number;
  }[];
};
