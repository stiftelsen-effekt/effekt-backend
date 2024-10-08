import { DateTime } from "luxon";
import paymentMethods from "../enums/paymentMethods";
import { RequestLocale } from "../middleware/locale";
import { DistributionCauseArea, DistributionInput } from "../schemas/types";
import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";
import { ExtractedDonorDonation, parseSwedishDonationsReport } from "./parsers/sedonations";
import { sumWithPrecision } from "./rounding";
import { parseSwedishMedgivandeReport } from "./parsers/semedgivande";

const Decimal = require("decimal.js");

export const importSwedishDonationsReport = async (report, medgivandeReport) => {
  const data = parseSwedishDonationsReport(report);

  if (medgivandeReport) {
    const medgivandeReportData = parseSwedishMedgivandeReport(medgivandeReport);

    for (const row of medgivandeReportData) {
      await DAO.autogiroagreements.addMandate({
        KID: row.kid.trim(),
        name_and_address: row.name,
        status: "ACTIVE",
        special_information: "",
        postal_code: "",
        postal_label: "",
        bank_account: "",
      });
    }
  } else {
    console.warn("No medgivande report found, skipping adding mandates");
  }

  for (const donor of data) {
    let donorId: number;
    let taxUnitId: number;
    const existing = await DAO.donors.getIDbyEmail(donor.email);
    if (existing) {
      donorId = existing;
      if (donor.ssn) {
        const units = await DAO.tax.getByDonorId(donorId, RequestLocale.SV);
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
    const orderedDonations = donor.donations.sort((a, b) => {
      const aDate = DateTime.fromISO(a.date, { locale: "sv-SE" });
      const bDate = DateTime.fromISO(b.date, { locale: "sv-SE" });
      return bDate.toMillis() - aDate.toMillis();
    });
    for (const donation of orderedDonations) {
      console.log(
        `Processing donation ${counter} for donor ${donor.email}, donated at ${donation.date}`,
      );

      if (donation.referenceNumber.trim().toLowerCase() === "adoveo") {
        console.log("Skipping adoveo donation");
        continue;
      }

      counter++;

      const parsedDate = DateTime.fromISO(donation.date, { locale: "sv-SE" });
      console.log(donation.date);
      console.log(parsedDate.toJSDate());

      // Transform donation distribution to match the database
      const distributionInput = await getDistributionInput(donorId, taxUnitId, donation);

      let KID: string;

      let newAgreementId: number | undefined;
      if (donation.paymentMethod === "Autogiro") {
        // console.log(donation.referenceNumber)

        const trimmedReferenceNumber = donation.referenceNumber.trim();
        // Check if autogiro agreement exists
        const agreement = await DAO.autogiroagreements.getAgreementByKID(trimmedReferenceNumber);

        if (!agreement) {
          let mandateId: number;

          const mandate = await DAO.autogiroagreements.getMandateByKID(trimmedReferenceNumber);
          // console.log(mandate)

          let active = true;
          if (mandate != null) {
            mandateId = mandate.ID;
          } else {
            mandateId = await DAO.autogiroagreements.addMandate({
              KID: trimmedReferenceNumber,
              name_and_address: donor.name,
              status: "CANCELLED",
              special_information: "",
              postal_code: "",
              postal_label: "",
              bank_account: "",
            });
            active = false;
          }

          // console.log(`Got mandate ${mandateId} for donor ${donor.email}`)

          // Create autogiro agreement
          newAgreementId = await DAO.autogiroagreements.addAgreement({
            KID: trimmedReferenceNumber,
            mandateID: mandateId,
            payment_date: parsedDate.day,
            notice: true,
            active: active,
            amount: donation.amount,
          });

          // console.log(`Added agreement ${newAgreementId} for donor ${donor.email} with KID ${trimmedReferenceNumber} and mandate ${mandateId}`)

          KID = trimmedReferenceNumber;

          await DAO.distributions.add({
            ...distributionInput,
            kid: KID,
          });
          // console.log("Added distribution for KID", KID)
        } else {
          // console.log(`Existing agreement found for the KID`)
          // Okay, we have an agreement, but is the donation distribution the same as the one in the agreement?
          const agreementDistribution = await DAO.distributions.getSplitByKID(agreement.KID);

          // console.log(`Checking if the agreeements are equal`)
          if (distributionsAreEqual(agreementDistribution, distributionInput)) {
            // We can use the same KID
            // console.log("Using existing KID", agreement.KID)
            KID = agreement.KID;

            const existing = await DAO.distributions.getSplitByKID(KID);
            if (!existing) {
              await DAO.distributions.add({
                ...distributionInput,
                kid: KID,
              });
              // console.log("Added distribution for KID", KID)
            }
          } else {
            // Use another KID with the same distribution if found
            // console.log("Using existing distribution")
            KID = await DAO.distributions.getKIDbySplit(distributionInput);
            // console.log("Got KID", KID)
          }
        }
      } else {
        // console.log(`Getting KID by split (not AutoGiro)`)
        KID = await DAO.distributions.getKIDbySplit(distributionInput);
      }
      if (!KID) {
        // console.log(`Creating a new KID`)
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
        // console.log(JSON.stringify(distributionInput, null, 2))
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

export const connectLegacySwedishDistributions = async (report) => {
  // Assumes that all donations have been imported
  const data = parseSwedishDonationsReport(report);

  for (const donor of data) {
    for (const donation of donor.donations) {
      const legacyReference = donation.referenceNumber.trim().toLowerCase().substring(0, 16);
      const paymentId = donation.finalBankId.trim().toLowerCase();

      try {
        await DAO.donations.addLegacySeDonationDistribution(legacyReference, paymentId);
      } catch (ex) {
        if (ex.code.indexOf("ER_DUP_ENTRY") !== -1) {
          console.log("Existing legacy distribution, skipping");
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

const getDistributionInput = async (
  donorId: number,
  taxUnitId: number | null,
  donation: ExtractedDonorDonation,
) => {
  const parsedDate = DateTime.fromISO(donation.date, { locale: "sv-SE" });

  const sum = donation.amount;
  const distributionSum =
    donation.distribution.globalHealth.sum +
    donation.distribution.animal.sum +
    donation.distribution.climate.sum +
    donation.distribution.operations.sum;

  if (sum !== distributionSum) {
    if (
      (sum - distributionSum).toFixed(2) === parseFloat(donation.distribution.unknownSum).toFixed(2)
    ) {
      // Spread according to quarterly key
      console.log("Sum mismatch is due to unknown sum, spreading according to quarterly key");
      const quarter = parsedDate.quarter;
      const parsedUnknownSum = new Decimal(donation.distribution.unknownSum);
      donation.distribution.globalHealth.sum = new Decimal(donation.distribution.globalHealth.sum)
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
    } else {
      console.error(
        "Unknown sum mismatch",
        sum - distributionSum,
        donation.distribution.unknownSum,
      );
      throw new Error("Unknown sum mismatch");
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
        percentageShare: ((org.amount / donation.distribution.globalHealth.sum) * 100).toString(),
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

  const causeAreasSum = sumWithPrecision(causeAreas.map((causeArea) => causeArea.percentageShare));
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

  const distributionInput: DistributionInput = {
    donorId,
    taxUnitId,
    causeAreas,
  };

  return distributionInput;
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

const distributionsAreEqual = (a: DistributionInput, b: DistributionInput) => {
  if (a.causeAreas.length !== b.causeAreas.length) {
    return false;
  }

  for (const causeArea of a.causeAreas) {
    const matchingCauseArea = b.causeAreas.find((bCauseArea) => bCauseArea.id === causeArea.id);
    if (!matchingCauseArea) {
      return false;
    }

    if (causeArea.organizations.length !== matchingCauseArea.organizations.length) {
      return false;
    }

    for (const org of causeArea.organizations) {
      const matchingOrg = matchingCauseArea.organizations.find((bOrg) => bOrg.id === org.id);
      if (!matchingOrg) {
        return false;
      }

      if (org.percentageShare !== matchingOrg.percentageShare) {
        return false;
      }
    }
  }

  return true;
};
