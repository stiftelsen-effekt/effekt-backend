import { components as donorComponents } from "./specs/donor";
import { components as taxComponents } from "./specs/taxunit";
import { components as distributionComponents } from "./specs/distribution";
import { components as donationComponents } from "./specs/donation";
import { components as fundraiserComponents } from "./specs/fundraiser";
import { components as taxReportComponents } from "./specs/taxreport";

export type Donor = donorComponents["schemas"]["Donor"];
export type TaxUnit = taxComponents["schemas"]["TaxUnit"];
export type Distribution = distributionComponents["schemas"]["Distribution"];
export type Donation = donationComponents["schemas"]["Donation"];
export type Fundraiser = fundraiserComponents["schemas"]["Fundraiser"];
export type TaxReport = taxReportComponents["schemas"]["TaxReport"];
export type TaxYearlyReportUnit = taxReportComponents["schemas"]["TaxYearlyReportUnit"];
