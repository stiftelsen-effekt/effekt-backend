import { faker } from "@faker-js/faker";
import {
  Distributions,
  Distribution_cause_areas,
  Distribution_cause_area_organizations,
  Cause_areas,
  Donations,
  Donors,
  Organizations,
  Payment,
  Payment_intent,
  Tax_unit,
  Avtalegiro_agreements,
  Vipps_agreements,
  AutoGiro_agreements,
  AutoGiro_mandates,
} from "@prisma/client";
import fs from "fs";
import path from "path";
import {
  generateFakeDistribution,
  generateFakeDonation,
  generateFakeDonor,
  generateFakePaymentIntent,
  generateFakeTaxUnit,
} from "./fakeDataGenerator";
import { generateAgreementsForDonations } from "./fakeAgreementsGenerator";
import { KID } from "../../src/custom_modules/KID";
import { DateTime } from "luxon";

const AMOUNT_OF_DONORS: number = 1000;
const MAX_DONATIONS_PER_DONOR: number = 30;

const fakeDonors: Donors[] = readAndParseJSON("fakeDonors.json");
const fakeDonations: Donations[] = readAndParseJSON("fakeDonations.json");
const fakeTaxUnits: Tax_unit[] = readAndParseJSON("fakeTaxUnits.json");
const fakePaymentIntents: Payment_intent[] = readAndParseJSON("fakePaymentIntents.json");
const fakePayments: Payment[] = readAndParseJSON("fakePayments.json");
const fakeOrganizations: Organizations[] = readAndParseJSON("fakeOrganizations.json");
const fakeCauseAreas: Cause_areas[] = readAndParseJSON("fakeCauseAreas.json");
const fakeDistributions: Distributions[] = readAndParseJSON("fakeDistributions.json");
const fakeDistributionCauseAreas: Distribution_cause_areas[] = readAndParseJSON(
  "fakeDistributionCauseAreas.json",
);
const fakeDistributionCauseAreaOrganizations: Distribution_cause_area_organizations[] =
  readAndParseJSON("fakeDistributionCauseAreaOrganizations.json");
const fakeAvtalegiroAgreements: Avtalegiro_agreements[] = [];
const fakeVippsAgreements: Vipps_agreements[] = [];
const fakeAutoGiroAgreements: AutoGiro_agreements[] = [];
const fakeAutoGiroMandates: AutoGiro_mandates[] = [];

populateFakeDataArrays();
writeToJSON("/fakeDonors.json", fakeDonors);
writeToJSON("/fakeDonations.json", fakeDonations);
writeToJSON("/fakeTaxUnits.json", fakeTaxUnits);
writeToJSON("/fakePaymentIntents.json", fakePaymentIntents);
writeToJSON("/fakeDistributions.json", fakeDistributions);
writeToJSON("/fakeDistributionCauseAreas.json", fakeDistributionCauseAreas);
writeToJSON("/fakeDistributionCauseAreaOrganizations.json", fakeDistributionCauseAreaOrganizations);
writeToJSON("/fakeAvtalegiroAgreements.json", fakeAvtalegiroAgreements);
writeToJSON("/fakeVippsAgreements.json", fakeVippsAgreements);
writeToJSON("/fakeAutoGiroAgreements.json", fakeAutoGiroAgreements);
writeToJSON("/fakeAutoGiroMandates.json", fakeAutoGiroMandates);

function populateFakeDataArrays() {
  const lastDonorID: number = getLastID(fakeDonors);
  const lastTaxUnitID: number = getLastID(fakeTaxUnits);

  for (let i = 1; i <= AMOUNT_OF_DONORS; i++) {
    const fakeDonor = createFakeDonor(lastDonorID + i);
    const fakeTaxUnit = createFakeTaxUnit(lastTaxUnitID + i, fakeDonor);

    createFakeDataToDonor(fakeDonor, fakeTaxUnit.ID);
  }

  console.log(`Generated ${fakeDonors.length} fake donors`);
  const agreements = generateAgreementsForDonations(fakeDonations, fakeDistributions, fakeTaxUnits);
  console.log(`Attached ${agreements.avtalegiroAgreements.length} fake Avtalegiro agreements`);
  console.log(`Attached ${agreements.vippsAgreements.length} fake Vipps agreements`);
  console.log(`Attached ${agreements.autoGiroAgreements.length} fake AutoGiro agreements`);
  fakeAvtalegiroAgreements.push(...agreements.avtalegiroAgreements);
  fakeVippsAgreements.push(...agreements.vippsAgreements);
  fakeAutoGiroAgreements.push(...agreements.autoGiroAgreements);
  fakeAutoGiroMandates.push(...agreements.autoGiroMandates);
}

function createFakeDonor(id: number) {
  const fakeDonor = generateFakeDonor(id);
  fakeDonors.push(fakeDonor);
  return fakeDonor;
}

function createFakeTaxUnit(id: number, fakeDonor: Donors) {
  const fakeTaxUnit = generateFakeTaxUnit(id, fakeDonor);
  fakeTaxUnits.push(fakeTaxUnit);
  return fakeTaxUnit;
}

function createFakeDataToDonor(donor: Donors, taxUnitID: number) {
  const lastDonationID: number = getLastID(fakeDonations);
  let currentDonationId = lastDonationID;

  // First decide if this donor will have recurring donations
  const hasRecurring =
    donor.ID === 27
      ? true // Allways give Håkon a recurring donation
      : donor.date_registered < DateTime.now().minus({ months: 3 }).toJSDate()
      ? faker.datatype.boolean()
      : false;

  if (hasRecurring) {
    // Generate recurring donation sequence
    const recurringPaymentId =
      donor.ID === 27
        ? 7 // Allways give Håkon AvtaleGiro
        : faker.helpers.arrayElement([7, 8, 12]); // AvtaleGiro, Vipps Recurring, AutoGiro
    const monthlyAmount = generatePlausibleAmount(100, 5000);
    const startDate = faker.date.between({
      from: donor.date_registered,
      to: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // At least 1 month ago
    });
    const durationMonths = faker.number.int({ min: 3, max: 24 });
    const kid = KID.generate(15, donor.ID as any);

    // Create monthly donations
    for (let i = 0; i < durationMonths; i++) {
      const donationDate = new Date(startDate);
      donationDate.setMonth(donationDate.getMonth() + i);

      // Skip future donations
      if (donationDate > new Date()) break;

      currentDonationId++;
      const fakeDonation = createFakeDonation(
        donor,
        currentDonationId,
        recurringPaymentId,
        monthlyAmount,
        kid,
        donationDate,
      );

      if (i === 0) {
        createFakePaymentIntent(currentDonationId, fakeDonation);
        const fakeDistribution = generateFakeDistribution(
          fakeDonation.Donor_ID,
          taxUnitID,
          fakeDonation,
          fakeCauseAreas,
          fakeOrganizations,
          getLastID(fakeDistributionCauseAreas),
          getLastID(fakeDistributionCauseAreaOrganizations),
        );
        fakeDistributions.push(fakeDistribution.distribution);
        fakeDistributionCauseAreas.push(...fakeDistribution.distributionCauseAreas);
        fakeDistributionCauseAreaOrganizations.push(
          ...fakeDistribution.distributionCauseAreaOrganizations,
        );
      }
    }
  }

  // Maybe add some one-time donations
  const oneTimeDonations = faker.number.int({ min: 0, max: MAX_DONATIONS_PER_DONOR });

  for (let i = 1; i <= oneTimeDonations; i++) {
    currentDonationId++;
    const fakeDonation = createFakeDonation(donor, currentDonationId);
    createFakePaymentIntent(currentDonationId, fakeDonation);

    const fakeDistribution = generateFakeDistribution(
      fakeDonation.Donor_ID,
      taxUnitID,
      fakeDonation,
      fakeCauseAreas,
      fakeOrganizations,
      getLastID(fakeDistributionCauseAreas),
      getLastID(fakeDistributionCauseAreaOrganizations),
    );
    fakeDistributions.push(fakeDistribution.distribution);
    fakeDistributionCauseAreas.push(...fakeDistribution.distributionCauseAreas);
    fakeDistributionCauseAreaOrganizations.push(
      ...fakeDistribution.distributionCauseAreaOrganizations,
    );
  }
}

function createFakeDonation(
  donor: Donors,
  donationID: number,
  forcedPaymentId?: number,
  forcedAmount?: number,
  forcedKID?: string,
  forcedDate?: Date,
) {
  const dateConfirmed: Date =
    forcedDate ?? faker.date.between({ from: donor.date_registered, to: new Date() });

  const payment = forcedPaymentId
    ? fakePayments.find((p) => p.ID === forcedPaymentId)!
    : selectPaymentMethod(dateConfirmed);

  const donationSum = forcedAmount ?? generatePlausibleAmount(100, 3000000);

  const fakeKID: string = forcedKID ?? KID.generate(15, donor.ID as any);

  const fakeDonation = generateFakeDonation(
    donor,
    donationID,
    fakeKID,
    payment,
    donationSum,
    dateConfirmed,
  );

  fakeDonations.push(fakeDonation);
  return fakeDonation;
}

function createFakePaymentIntent(id: number, donation: Donations) {
  const fakePaymentIntent = generateFakePaymentIntent(id, donation);
  fakePaymentIntents.push(fakePaymentIntent);
}

function getLastID(dataArray: any[]): number {
  return dataArray[dataArray.length - 1]?.ID ?? 0;
}

function writeToJSON(pathToJSON: string, data: Object) {
  const basePath: string = path.resolve(__dirname, "json/");
  fs.writeFile(basePath + pathToJSON, JSON.stringify(data), "utf8", (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
      return;
    }
  });
}

function selectPaymentMethod(date: Date): Payment {
  const nonRecurringPayments = fakePayments.filter((p) => ![7, 8, 12].includes(p.ID));

  // Apply time-based restrictions
  const rand = Math.random();
  let validPayments = nonRecurringPayments.filter((p) => {
    if (p.ID === 10) return date < new Date("2023-01-01"); // Crypto before 2023
    if (p.ID === 9) return date < new Date("2023-01-01"); // Facebook before 2023
    if ([13, 14].includes(p.ID)) return date > new Date("2022-07-01"); // Adoveo after summer 2022
    // Special probability handling for rare payment types
    if (p.ID === 15 && rand > 0.999) return true; // Influenced 1/1000
    if (p.ID === 10 && rand > 0.9999) return true; // Crypto 1/10000
    return true;
  });

  // Handle seasonal payments (Facebook and Adoveo)
  if (date.getMonth() === 11) {
    // December
    const isDecemberDonation = Math.random() < 0.4; // 40% chance in December
    if (isDecemberDonation) {
      const seasonalPayments = validPayments.filter((p) => [9, 13, 14].includes(p.ID));
      if (seasonalPayments.length > 0) {
        return faker.helpers.arrayElement(seasonalPayments);
      }
    }
  } else {
    // Rest of the year - much lower chance for seasonal payments
    const isSeasonalDonation = Math.random() < 0.05; // 5% chance outside December
    if (!isSeasonalDonation) {
      validPayments = validPayments.filter((p) => ![9, 13, 14].includes(p.ID));
    }
  }

  // Default to random selection from remaining valid payments
  return faker.helpers.arrayElement(validPayments);
}

function generatePlausibleAmount(min = 100, max = 3000000) {
  // Determine the range of orders of magnitude for min and max
  const minOrder = Math.floor(Math.log10(min));
  const maxOrder = Math.floor(Math.log10(max));
  const magnitudeRange = maxOrder - minOrder + 1;

  // Generate a biased order of magnitude using exponential decay
  const biasedMagnitude = minOrder + Math.floor(Math.log(1 - Math.random()) / Math.log(0.1));
  const clampedMagnitude = Math.min(biasedMagnitude, maxOrder);

  // Generate a random amount within the selected magnitude
  const lowerBound = Math.pow(10, clampedMagnitude);
  const upperBound = Math.min(Math.pow(10, clampedMagnitude + 1), max);
  const rawAmount = lowerBound + Math.random() * (upperBound - lowerBound);

  // Round to the nearest order of magnitude for a realistic donation amount
  const orderOfMagnitude = Math.floor(Math.log10(rawAmount));
  const roundingFactor = Math.pow(10, orderOfMagnitude);

  return Math.round(rawAmount / roundingFactor) * roundingFactor;
}

function readAndParseJSON(filePath: string) {
  const jsonFile = fs.readFileSync("prisma/fakedata/json/" + filePath, "utf8");
  return JSON.parse(jsonFile);
}
