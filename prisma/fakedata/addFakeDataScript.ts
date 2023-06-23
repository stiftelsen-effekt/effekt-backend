import { faker } from "@faker-js/faker";
import {
  Combining_table,
  Distribution,
  Donations,
  Donors,
  Organizations,
  Payment,
  Payment_intent,
  Tax_unit,
} from "@prisma/client";
import fs from "fs";
import path from "path";
import {
  generateCombiningTable,
  generateFakeDistribution,
  generateFakeDonation,
  generateFakeDonor,
  generateFakePaymentIntent,
  generateFakeTaxUnit,
} from "./fakeDataGenerator";

const AMOUNT_OF_DONORS: number = 50;
const MAX_DONATIONS_PER_DONOR: number = 10;

const fakeDonors: Donors[] = readAndParseJSON("fakeDonors.json");
const fakeDonations: Donations[] = readAndParseJSON("fakeDonations.json");
const fakeTaxUnits: Tax_unit[] = readAndParseJSON("fakeTaxUnits.json");
const fakeDistributions: Distribution[] = readAndParseJSON("fakeDistributions.json");
const fakeCombiningTables: Combining_table[] = readAndParseJSON("fakeCombiningTables.json");
const fakePaymentIntents: Payment_intent[] = readAndParseJSON("fakePaymentIntents.json");
const fakePayments: Payment[] = readAndParseJSON("fakePayments.json");
const fakeOrganizations: Organizations[] = readAndParseJSON("fakeOrganizations.json");

populateFakeDataArrays();
writeToJSON("/fakeDonors.json", fakeDonors);
writeToJSON("/fakeDonations.json", fakeDonations);
writeToJSON("/fakeTaxUnits.json", fakeTaxUnits);
writeToJSON("/fakeDistributions.json", fakeDistributions);
writeToJSON("/fakeCombiningTables.json", fakeCombiningTables);
writeToJSON("/fakePaymentIntents.json", fakePaymentIntents);

function populateFakeDataArrays() {
  const lastDonorID: number = getLastID(fakeDonors);
  const lastTaxUnitID: number = getLastID(fakeTaxUnits);

  for (let i = 1; i <= AMOUNT_OF_DONORS; i++) {
    const fakeDonor = createFakeDonor(lastDonorID + i);
    const fakeTaxUnit = createFakeTaxUnit(lastTaxUnitID + i, fakeDonor);

    createFakeDataToDonor(fakeDonor, fakeTaxUnit.ID);
  }
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
  const howManyDonations: number = faker.number.int({ min: 0, max: MAX_DONATIONS_PER_DONOR });

  for (let i = 1; i <= howManyDonations; i++) {
    let incrementedID: number = lastDonationID + i;
    const fakeDonation = createFakeDonation(donor, incrementedID);
    createFakePaymentIntent(incrementedID, fakeDonation);

    const isStandardSplit: boolean = faker.datatype.boolean(0.4);
    createFakeDistributions().forEach((distribution) =>
      createFakeCombiningTable(donor.ID, distribution.ID, taxUnitID, fakeDonation, isStandardSplit),
    );
  }
}

function createFakeDonation(donor: Donors, donationID: number) {
  const fakeDonation = generateFakeDonation(donor, donationID, fakePayments);
  fakeDonations.push(fakeDonation);
  return fakeDonation;
}

function createFakePaymentIntent(id: number, donation: Donations) {
  const fakePaymentIntent = generateFakePaymentIntent(id, donation);
  fakePaymentIntents.push(fakePaymentIntent);
}

function createFakeDistributions() {
  const lastDistributionID: number = getLastID(fakeDistributions);
  const fakeDistribution = generateFakeDistribution(lastDistributionID + 1, fakeOrganizations);
  fakeDistributions.push(...fakeDistribution);
  return fakeDistribution;
}

function createFakeCombiningTable(
  donorID: number,
  distributionID: number,
  taxUnitID: number,
  donation: Donations,
  isStandardSplit: boolean,
) {
  const fakeCombiningTable = generateCombiningTable(
    donorID,
    distributionID,
    taxUnitID,
    donation,
    isStandardSplit,
  );
  fakeCombiningTables.push(fakeCombiningTable);
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

function readAndParseJSON(filePath: string) {
  const jsonFile = fs.readFileSync("prisma/fakedata/json/" + filePath, "utf8");
  return JSON.parse(jsonFile);
}
