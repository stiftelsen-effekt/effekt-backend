import { DAO } from "./DAO";
import { EA_NORGE_META_OWNER_ID } from "./DAO_modules/meta";
import { TaxDeductionDonation, getYearlyMapping } from "./taxdeductions";
import { RequestLocale } from "../middleware/locale";
import { TaxReport, TaxYearlyReportUnit } from "../schemas/types";

/**
 * The donor's yearly tax reports, from the previous year down to 2022: per year the donor's
 * active tax units with their donations and deductions (Gi Effektivt and EAN Giverportal), the
 * donations without a tax unit, and the non-deductible (crypto) donations. Served by
 * GET /donors/:id/taxreports and the minside.taxReports tRPC procedure.
 */
export async function getYearlyTaxReports(
  donorId: number,
  locale: RequestLocale,
): Promise<TaxReport[]> {
  let taxUnits = await DAO.tax.getByDonorId(donorId, locale);
  taxUnits = taxUnits.filter((tu) => tu.archived === null);

  let donations = await DAO.donations.getByDonorId(donorId);
  // Donations through EA Giverportal (EA Norge) are shown as EA funds donations,
  // so they are left out of the Gi Effektivt donations to avoid counting them twice
  const geOnlyDonations = donations.filter((d) => d.metaOwnerId !== EA_NORGE_META_OWNER_ID);
  let eaFundsDonations = await DAO.donations.getEAFundsDonations(donorId);

  // Previous year down to 2022
  const years = Array.from(
    { length: new Date().getFullYear() - 1 - 2021 },
    (_, i) => 2022 + i,
  ).reverse();
  const reports: Array<TaxReport> = [];

  for (const year of years) {
    const yearlyreportunits = taxUnits.map((tu): TaxYearlyReportUnit => {
      const fundsDonations: TaxDeductionDonation[] = eaFundsDonations
        .filter((d) => new Date(d.timestamp).getFullYear() === year && d.taxUnitId === tu.id)
        .map((d) => ({
          year: year,
          sum: parseFloat(d.sum),
          taxUnitId: tu.id,
        }));
      const fundsSum = fundsDonations.reduce((a, b) => a + b.sum, 0);

      const geDonations: TaxDeductionDonation[] = geOnlyDonations
        .filter((d) => new Date(d.timestamp!).getFullYear() === year && d.taxUnitId === tu.id)
        .map((d) => ({
          year: year,
          sum: parseFloat(d.sum),
          taxUnitId: tu.id,
        }));
      const geSum = geDonations.reduce((a, b) => a + b.sum, 0);

      const deductionRules = getYearlyMapping(locale);

      if (!(year in deductionRules)) {
        throw new Error(`Missing yearly mapping for year ${year}`);
      }

      const completeDeduction = deductionRules[year]([...geDonations, ...fundsDonations]);

      let reportUnit: TaxYearlyReportUnit = {
        id: tu.id,
        name: tu.name,
        ssn: tu.ssn!,
        sumDonations: geSum + fundsSum,
        taxDeduction: completeDeduction.deduction,
        channels: [],
      };

      if (parseFloat(tu.sumDonations!) > 0) {
        reportUnit.channels.push({
          channel: "Gi Effektivt",
          sumDonations: geSum,
        });
      }

      if (fundsSum > 0) {
        reportUnit.channels.push({
          channel: "EAN Giverportal",
          sumDonations: fundsSum,
        });
      }

      return reportUnit;
    });

    const cryptoDonationsInYear = donations.filter((d) => {
      return new Date(d.timestamp!).getFullYear() === year && d.paymentMethod === "Crypto";
    });

    const sumGeDonationsWithoutTaxUnit = geOnlyDonations
      .filter((d) => {
        return new Date(d.timestamp!).getFullYear() === year && d.taxUnitId === null;
      })
      .reduce((acc, item) => acc + parseFloat(item.sum), 0);

    const sumEanDOnationsWithoutTaxUnit = eaFundsDonations
      .filter((d) => {
        return new Date(d.timestamp).getFullYear() === year && d.taxUnitId === null;
      })
      .reduce((acc, item) => acc + parseFloat(item.sum), 0);

    reports.push({
      year: year,
      units: yearlyreportunits,
      sumDonations: yearlyreportunits.reduce((a, b) => a + b.sumDonations, 0),
      sumTaxDeductions: yearlyreportunits.map((u) => u.taxDeduction).reduce((a, b) => a + b, 0),
      sumDonationsWithoutTaxUnit: {
        sumDonations: sumGeDonationsWithoutTaxUnit + sumEanDOnationsWithoutTaxUnit,
        channels: [
          {
            channel: "Gi Effektivt",
            sumDonations: sumGeDonationsWithoutTaxUnit,
          },
          {
            channel: "EAN Giverportal",
            sumDonations: sumEanDOnationsWithoutTaxUnit,
          },
        ],
      },
      sumNonDeductibleDonationsByType:
        cryptoDonationsInYear.length > 0
          ? [
              {
                type: "Crypto",
                sumNonDeductibleDonations: cryptoDonationsInYear
                  .map((d) => parseFloat(d.sum))
                  .reduce((a, b) => a + b, 0),
              },
            ]
          : [],
    });
  }

  return reports;
}
