import { Tax_unit } from "@prisma/client";
import { TaxUnit } from "../schemas/types";
import { DateTime } from "luxon";
import { SqlResult } from "./DAO";
import { RequestLocale } from "../middleware/locale";

export interface TaxDeductionDonation {
  year: number;
  sum: number;
  taxUnitId: number;
}

export interface TaxDeductionCalculationInput {
  donations: TaxDeductionDonation[];
  taxUnits: Tax_unit[];
  locale: RequestLocale;
}

export interface TaxDeductionYearlyMapping {
  [year: number]: (donations: TaxDeductionDonation[]) => TaxUnitYearlyCalculationResult;
}

type TaxUnitYearlyCalculationResult = {
  year: number;
  sumDonations: number;
  deduction: number;
  benefit: number;
};

export const getTaxUnitsWithDeductions: (input: {
  donations: TaxDeductionDonation[];
  taxUnits: SqlResult<Tax_unit>[];
  locale: RequestLocale;
}) => TaxUnit[] = ({ donations, taxUnits, locale }) => {
  const result: TaxUnit[] = [];

  for (const taxUnit of taxUnits) {
    const taxUnitDonations = donations.filter((donation) => donation.taxUnitId === taxUnit.ID);

    const yearlyMapping = getYearlyMapping(locale);

    // For every year from 2016 to current date, calculate the tax deduction and benefit
    const today = DateTime.now();

    const calculatedDeductionResults: TaxUnitYearlyCalculationResult[] = [];

    for (let year = 2016; year <= today.year; year++) {
      if (!yearlyMapping[year]) {
        throw new Error(`Missing yearly mapping for year ${year}`);
      }
      const yearlyCalculationResult = yearlyMapping[year](
        taxUnitDonations.filter((donation) => donation.year === year),
      );

      calculatedDeductionResults.push(yearlyCalculationResult);
    }

    result.push({
      id: taxUnit.ID,
      donorId: taxUnit.Donor_ID,
      name: taxUnit.full_name,
      ssn: taxUnit.ssn,
      registered: taxUnit.registered as unknown as string,
      archived: taxUnit.archived as unknown as string,
      sumDonations: taxUnitDonations.reduce((acc, donation) => acc + donation.sum, 0).toString(),
      numDonations: taxUnitDonations.length,
      taxDeductions: calculatedDeductionResults,
    });
  }

  return result;
};

/**
 * Each year might have a different minimum threshold and maximum deduction limit for NO tax units.
 * Donations are provided as a filtered list of donations for a specific tax unit and year.
 */
export const getYearlyMapping = (locale: RequestLocale): TaxDeductionYearlyMapping => {
  switch (locale) {
    case RequestLocale.NO:
      return {
        2016: (donations) =>
          getNoTaxDeductions({
            year: 2016,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2017: (donations) =>
          getNoTaxDeductions({
            year: 2017,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2018: (donations) =>
          getNoTaxDeductions({
            year: 2018,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2019: (donations) =>
          getNorwegianDeductionByYearlySum({
            year: 2019,
            minimumThreshold: 500,
            maximumDeductionLimit: 50000,
            baseTaxRate: 0.22,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2020: (donations) =>
          getNorwegianDeductionByYearlySum({
            year: 2020,
            minimumThreshold: 500,
            maximumDeductionLimit: 50000,
            baseTaxRate: 0.22,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2021: (donations) =>
          getNorwegianDeductionByYearlySum({
            year: 2021,
            minimumThreshold: 500,
            maximumDeductionLimit: 50000,
            baseTaxRate: 0.22,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2022: (donations) =>
          getNorwegianDeductionByYearlySum({
            year: 2022,
            minimumThreshold: 500,
            maximumDeductionLimit: 25000,
            baseTaxRate: 0.22,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2023: (donations) =>
          getNorwegianDeductionByYearlySum({
            year: 2023,
            minimumThreshold: 500,
            maximumDeductionLimit: 25000,
            baseTaxRate: 0.22,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2024: (donations) =>
          getNorwegianDeductionByYearlySum({
            year: 2024,
            minimumThreshold: 500,
            maximumDeductionLimit: 25000,
            baseTaxRate: 0.22,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
      };
    case RequestLocale.SE:
      return {
        2016: (donations) =>
          getNoTaxDeductions({
            year: 2016,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2017: (donations) =>
          getNoTaxDeductions({
            year: 2017,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2018: (donations) =>
          getNoTaxDeductions({
            year: 2018,
            sumDonations: donations.reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2019: (donations) =>
          getSwedishDeductionByYearlySum({
            year: 2019,
            minimumThreshold: 2000,
            maximumDeductionLimit: 12000,
            baseTaxRate: 0.25,
            sumDonations: donations
              .filter((d) => d.sum >= 200)
              .reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2020: (donations) =>
          getSwedishDeductionByYearlySum({
            year: 2020,
            minimumThreshold: 2000,
            maximumDeductionLimit: 12000,
            baseTaxRate: 0.25,
            sumDonations: donations
              .filter((d) => d.sum >= 200)
              .reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2021: (donations) =>
          getSwedishDeductionByYearlySum({
            year: 2021,
            minimumThreshold: 2000,
            maximumDeductionLimit: 12000,
            baseTaxRate: 0.25,
            sumDonations: donations
              .filter((d) => d.sum >= 200)
              .reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2022: (donations) =>
          getSwedishDeductionByYearlySum({
            year: 2022,
            minimumThreshold: 2000,
            maximumDeductionLimit: 12000,
            baseTaxRate: 0.25,
            sumDonations: donations
              .filter((d) => d.sum >= 200)
              .reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2023: (donations) =>
          getSwedishDeductionByYearlySum({
            year: 2023,
            minimumThreshold: 2000,
            maximumDeductionLimit: 12000,
            baseTaxRate: 0.25,
            sumDonations: donations
              .filter((d) => d.sum >= 200)
              .reduce((acc, donation) => acc + donation.sum, 0),
          }),
        2024: (donations) =>
          getSwedishDeductionByYearlySum({
            year: 2024,
            minimumThreshold: 2000,
            maximumDeductionLimit: 12000,
            baseTaxRate: 0.25,
            sumDonations: donations
              .filter((d) => d.sum >= 200)
              .reduce((acc, donation) => acc + donation.sum, 0),
          }),
      };
    default:
      throw new Error("Invalid locale");
  }
};

const getNoTaxDeductions: (input: {
  year: number;
  sumDonations: number;
}) => TaxUnitYearlyCalculationResult = ({ year, sumDonations }) => {
  return {
    year,
    sumDonations,
    deduction: 0,
    benefit: 0,
  };
};

const getNorwegianDeductionByYearlySum: (input: {
  year: number;
  minimumThreshold: number;
  maximumDeductionLimit: number;
  baseTaxRate: number;
  sumDonations: number;
}) => TaxUnitYearlyCalculationResult = ({
  year,
  minimumThreshold,
  maximumDeductionLimit,
  baseTaxRate,
  sumDonations,
}) => {
  const deduction =
    sumDonations >= minimumThreshold ? Math.min(sumDonations, maximumDeductionLimit) : 0;
  const benefit = deduction * baseTaxRate;

  return {
    year,
    sumDonations,
    deduction,
    benefit,
  };
};

/**
 * Swedish rules
 * 25% of sum of donations
 * Maximum sum is 12 000
 * Sum must be over 2 000
 * Only donations of value 200 sek and over are counted towards the sum
 */
const getSwedishDeductionByYearlySum: (input: {
  year: number;
  minimumThreshold: number;
  maximumDeductionLimit: number;
  baseTaxRate: number;
  sumDonations: number;
}) => TaxUnitYearlyCalculationResult = ({
  year,
  minimumThreshold,
  maximumDeductionLimit,
  baseTaxRate,
  sumDonations,
}) => {
  const deduction =
    sumDonations >= minimumThreshold ? Math.min(sumDonations, maximumDeductionLimit) : 0;
  const benefit = deduction * baseTaxRate;

  return {
    year,
    sumDonations,
    deduction,
    benefit,
  };
};
