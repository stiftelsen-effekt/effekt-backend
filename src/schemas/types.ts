import { components as donorComponents } from "./specs/donor";
import { components as taxComponents } from "./specs/taxunit";
import { components as distributionComponents } from "./specs/distribution";
import { components as donationComponents } from "./specs/donation";
import { components as fundraiserComponents } from "./specs/fundraiser";
import { components as taxReportComponents } from "./specs/taxreport";
import { components as causeAreaComponents } from "./specs/causearea";
import { components as organizationComponents } from "./specs/organization";

export type Donor = donorComponents["schemas"]["Donor"];
export type TaxUnit = taxComponents["schemas"]["TaxUnit"];
export type Distribution = distributionComponents["schemas"]["Distribution"];
export type DistributionCauseArea = distributionComponents["schemas"]["DistributionCauseArea"];
export type DistributionCauseAreaOrganization =
  distributionComponents["schemas"]["DistributionCauseAreaOrganization"];
export type DistributionInput = distributionComponents["schemas"]["DistributionInput"];
export type CauseArea = causeAreaComponents["schemas"]["CauseArea"];
export type Organization = organizationComponents["schemas"]["Organization"];
export type Donation = donationComponents["schemas"]["Donation"];
export type Fundraiser = fundraiserComponents["schemas"]["Fundraiser"];
export type TaxReport = taxReportComponents["schemas"]["TaxReport"];
export type TaxYearlyReportUnit = taxReportComponents["schemas"]["TaxYearlyReportUnit"];
