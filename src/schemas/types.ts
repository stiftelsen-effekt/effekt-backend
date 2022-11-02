import { components as donorComponents } from "./specs/donor";
import { components as taxComponents } from "./specs/taxunit";
import { components as distributionComponents } from "./specs/distribution";

export type Donor = donorComponents["schemas"]["Donor"];
export type TaxUnit = taxComponents["schemas"]["TaxUnit"];
export type Distribution = distributionComponents["schemas"]["Distribution"];
