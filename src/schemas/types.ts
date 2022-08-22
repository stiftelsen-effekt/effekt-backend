import { components as donorComponents } from "./specs/donor";
import { components as taxComponents } from "./specs/taxunit";

export type Donor = donorComponents["schemas"]["Donor"];
export type TaxUnit = taxComponents["schemas"]["TaxUnit"];
