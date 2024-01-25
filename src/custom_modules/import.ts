import { DateTime } from "luxon";
import paymentMethods from "../enums/paymentMethods";
import { RequestLocale } from "../middleware/locale";
import { DistributionCauseArea, DistributionInput } from "../schemas/types";
import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";
import { parseSwedishDonationsReport } from "./parsers/sedonations";
import { sumWithPrecision } from "./rounding";

const Decimal = require("decimal.js");

export const importSwedishDonationsReport = async (report) => {
  const data = parseSwedishDonationsReport(report);

  for (const donor of data) {
    if (donor.email !== "amandalinkan@gmail.com") {
      continue;
    }
    let donorId: number;
    let taxUnitId: number;
    const existing = await DAO.donors.getIDbyEmail(donor.email);
    if (existing) {
      donorId = existing;
      if (donor.ssn) {
        const units = await DAO.tax.getByDonorId(donorId, RequestLocale.SE);
        if (units.some((unit) => unit.ssn === donor.ssn)) {
          taxUnitId = units.find((unit) => unit.ssn === donor.ssn).id;
        } else {
          taxUnitId = await DAO.tax.addTaxUnit(donorId, donor.ssn, donor.name);
        }
      }
    } else {
      donorId = await DAO.donors.add({
        email: donor.email,
        full_name: donor.name,
      });

      if (donor.ssn) {
        taxUnitId = await DAO.tax.addTaxUnit(donorId, donor.ssn, donor.name);
      }
    }

    // Used for externalReference
    let counter = 0;
    for (const donation of donor.donations) {
      console.log(`Processing donation ${counter} for donor ${donor.email}`);

      if (donation.referenceNumber.trim().toLowerCase() === "adoveo") {
        console.log("Skipping adoveo donation");
        continue;
      }

      counter++;

      const parsedDate = DateTime.fromISO(donation.date, { locale: "sv-SE" });

      // Transform donation to match the database
      const sum = donation.amount;
      const distributionSum =
        donation.distribution.globalHealth.sum +
        donation.distribution.animal.sum +
        donation.distribution.climate.sum +
        donation.distribution.operations.sum;

      if (sum !== distributionSum) {
        if (sum - distributionSum == parseFloat(donation.distribution.unknownSum)) {
          // Spread according to quarterly key
          console.log("Sum mismatch is due to unknown sum, spreading according to quarterly key");
          const quarter = parsedDate.quarter;
          const parsedUnknownSum = new Decimal(donation.distribution.unknownSum);
          donation.distribution.globalHealth.sum = new Decimal(
            donation.distribution.globalHealth.sum,
          )
            .plus(parsedUnknownSum.times(querterlyCauseAreaKeys[quarter].globalHealth))
            .toNumber();
          donation.distribution.globalHealth.standardDistribution = true;
          donation.distribution.animal.sum = new Decimal(donation.distribution.animal.sum)
            .plus(parsedUnknownSum.times(querterlyCauseAreaKeys[quarter].animalWelfare))
            .toNumber();
          donation.distribution.animal.standardDistribution = true;
          donation.distribution.climate.sum = new Decimal(donation.distribution.climate.sum)
            .plus(parsedUnknownSum.times(querterlyCauseAreaKeys[quarter].climateChange))
            .toNumber();
          donation.distribution.climate.standardDistribution = true;
          console.log(JSON.stringify(donation.distribution, null, 2));
        } else {
          console.error(
            "Unknown sum mismatch",
            sum - distributionSum,
            donation.distribution.unknownSum,
          );
          console.error("For donor ", donor.email);
          continue;
        }
      }

      const causeAreas: DistributionCauseArea[] = [];

      if (donation.distribution.globalHealth.sum > 0) {
        causeAreas.push({
          id: 1,
          percentageShare: ((donation.distribution.globalHealth.sum / sum) * 100).toString(),
          standardSplit: donation.distribution.globalHealth.standardDistribution,
          organizations: donation.distribution.globalHealth.orgs.map((org) => ({
            id: orgAbrivToIdMapping[org.name],
            percentageShare: (
              (org.amount / donation.distribution.globalHealth.sum) *
              100
            ).toString(),
          })),
        });
      }

      if (donation.distribution.animal.sum > 0) {
        causeAreas.push({
          id: 2,
          percentageShare: ((donation.distribution.animal.sum / sum) * 100).toString(),
          standardSplit: donation.distribution.animal.standardDistribution,
          organizations: donation.distribution.animal.orgs.map((org) => ({
            id: orgAbrivToIdMapping[org.name],
            percentageShare: ((org.amount / donation.distribution.animal.sum) * 100).toString(),
          })),
        });
      }

      if (donation.distribution.climate.sum > 0) {
        causeAreas.push({
          id: 3,
          percentageShare: ((donation.distribution.climate.sum / sum) * 100).toString(),
          standardSplit: donation.distribution.climate.standardDistribution,
          organizations: donation.distribution.climate.orgs.map((org) => ({
            id: orgAbrivToIdMapping[org.name],
            percentageShare: ((org.amount / donation.distribution.climate.sum) * 100).toString(),
          })),
        });
      }

      if (donation.distribution.operations.sum > 0) {
        causeAreas.push({
          id: 4,
          percentageShare: ((donation.distribution.operations.sum / sum) * 100).toString(),
          standardSplit: donation.distribution.operations.standardDistribution,
          organizations: donation.distribution.operations.orgs.map((org) => ({
            id: orgAbrivToIdMapping[org.name],
            percentageShare: ((org.amount / donation.distribution.operations.sum) * 100).toString(),
          })),
        });
      }

      for (const causeArea of causeAreas) {
        if (causeArea.standardSplit) {
          causeArea.organizations = await DAO.distributions.getStandardDistributionByCauseAreaID(
            causeArea.id,
          );
        }
      }

      const causeAreasSum = sumWithPrecision(
        causeAreas.map((causeArea) => causeArea.percentageShare),
      );
      if (causeAreasSum !== "100") {
        console.log("Cause area sum is not 100, adjusting");
        causeAreas[0].percentageShare = new Decimal(causeAreas[0].percentageShare)
          .plus(new Decimal(100).minus(new Decimal(causeAreasSum)))
          .toString();
      }

      for (const causeArea of causeAreas) {
        const orgsSum = sumWithPrecision(causeArea.organizations.map((org) => org.percentageShare));
        if (orgsSum !== "100") {
          console.log("Org sum is not 100, adjusting");
          causeArea.organizations[0].percentageShare = new Decimal(
            causeArea.organizations[0].percentageShare,
          )
            .plus(new Decimal(100).minus(new Decimal(orgsSum)))
            .toString();
        }
      }

      console.log(JSON.stringify(causeAreas, null, 2));

      const distributionInput: DistributionInput = {
        donorId,
        taxUnitId,
        causeAreas,
      };

      let KID: string;
      KID = await DAO.distributions.getKIDbySplit(distributionInput);
      if (!KID) {
        let newKID = await donationHelpers.createKID();
        await DAO.distributions.add({
          ...distributionInput,
          kid: newKID,
        });
        KID = newKID;
      }

      let paymentMethodId: number;
      if (donation.paymentMethod === "Nordea") {
        if (donation.referenceNumber === "adoveo") {
          paymentMethodId = paymentMethods.fundrasier;
        } else {
          paymentMethodId = paymentMethods.bank;
        }
      } else if (donation.paymentMethod === "Autogiro") {
        paymentMethodId = paymentMethods.autoGiro;
      } else {
        console.error("Unknown payment method", donation.paymentMethod);
        continue;
      }

      try {
        await DAO.donations.add(
          KID,
          paymentMethodId,
          donation.amount,
          parsedDate.toJSDate(),
          donation.finalBankId,
        );
      } catch (ex) {
        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          console.log("Donation already exists, skipping");
          continue;
        } else {
          throw ex;
        }
      }
    }
  }

  return true;
};

const querterlyCauseAreaKeys = {
  1: {
    globalHealth: 0.5926781406,
    climateChange: 0.27201705,
    animalWelfare: 0.1353048094,
  },
  2: {
    globalHealth: 0.6225749186,
    climateChange: 0.2642915309,
    animalWelfare: 0.1131335505,
  },
  3: {
    globalHealth: 0.4697435897,
    climateChange: 0.4312820513,
    animalWelfare: 0.098974359,
  },
  4: {
    globalHealth: 0.5385023616,
    climateChange: 0.3631056626,
    animalWelfare: 0.0983919758,
  },
};

const orgAbrivToIdMapping: {
  [key: string]: number;
} = {
  sci: 28,
  amf: 1,
  mc: 4,
  hki: 10,
  gd: 29,
  gw: 12,
  gw2: 15,
  ni: 14,
  dtw: 30,
  catf: 20,
  burn: 31,
  cw: 32,
  tw: 33,
  ec: 34,
  fp: 26,
  c180: 35,
  il: 36,
  gec: 37,
  ci: 38,
  asf: 39,
  thl: 18,
  gfi: 17,
  wai: 40,
  fn: 25,
  ace: 19,
  operations: 27,
};
