import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const basePath: string = path.resolve(__dirname, "./fakedata/json/");

//TODO: Add remaining static database tables

async function main() {
  console.log(basePath + "test.json");

  const fakeDonors = fs.readFileSync(basePath + "/fakeDonors.json", "utf8");
  const fakePayments = fs.readFileSync(basePath + "/fakePayments.json", "utf8");
  const fakeOrganizations = fs.readFileSync(basePath + "/fakeOrganizations.json", "utf8");
  const fakeTaxUnits = fs.readFileSync(basePath + "/fakeTaxUnits.json", "utf8");
  const fakeDonations = fs.readFileSync(basePath + "/fakeDonations.json", "utf8");
  const fakePaymentIntents = fs.readFileSync(basePath + "/fakePaymentIntents.json", "utf8");
  const fakeDistributions = fs.readFileSync(basePath + "/fakeDistributions.json", "utf8");
  const fakeCombiningTables = fs.readFileSync(basePath + "/fakeCombiningTables.json", "utf8");
  const fakeReferralTypes = readAndParseFile("/fakeReferralTypes.json");
  const fakeDataOwner = readAndParseFile("/fakeDataOwner.json");

  await prisma.donors.createMany({ data: JSON.parse(fakeDonors) });
  await prisma.payment.createMany({ data: JSON.parse(fakePayments) });
  await prisma.organizations.createMany({ data: JSON.parse(fakeOrganizations) });
  await prisma.tax_unit.createMany({ data: JSON.parse(fakeTaxUnits) });
  await prisma.donations.createMany({ data: JSON.parse(fakeDonations) });
  await prisma.payment_intent.createMany({ data: JSON.parse(fakePaymentIntents) });
  await prisma.distribution.createMany({ data: JSON.parse(fakeDistributions) });
  await prisma.combining_table.createMany({ data: JSON.parse(fakeCombiningTables) });
  await prisma.referral_types.createMany({ data: fakeReferralTypes });
  await prisma.data_owner.createMany({ data: fakeDataOwner });
}

function readAndParseFile(path: string) {
  const jsonFile: string = fs.readFileSync(basePath + path, "utf8");
  return JSON.parse(jsonFile);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
