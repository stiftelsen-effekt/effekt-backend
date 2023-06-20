import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const basePath: string = path.resolve(__dirname, "./fakedata/json/");

async function main() {
  const fakeDonors = readAndParseJsonFile("/fakeDonors.json");
  const fakePayments = readAndParseJsonFile("/fakePayments.json");
  const fakeOrganizations = readAndParseJsonFile("/fakeOrganizations.json");
  const fakeTaxUnits = readAndParseJsonFile("/fakeTaxUnits.json");
  const fakeDonations = readAndParseJsonFile("/fakeDonations.json");
  const fakePaymentIntents = readAndParseJsonFile("/fakePaymentIntents.json");
  const fakeDistributions = readAndParseJsonFile("/fakeDistributions.json");
  const fakeCombiningTables = readAndParseJsonFile("/fakeCombiningTables.json");
  const fakeReferralTypes = readAndParseJsonFile("/fakeReferralTypes.json");
  const fakeDataOwner = readAndParseJsonFile("/fakeDataOwner.json");

  await prisma.donors.createMany({ data: fakeDonors });
  await prisma.payment.createMany({ data: fakePayments });
  await prisma.organizations.createMany({ data: fakeOrganizations });
  await prisma.tax_unit.createMany({ data: fakeTaxUnits });
  await prisma.donations.createMany({ data: fakeDonations });
  await prisma.payment_intent.createMany({ data: fakePaymentIntents });
  await prisma.distribution.createMany({ data: fakeDistributions });
  await prisma.combining_table.createMany({ data: fakeCombiningTables });
  await prisma.referral_types.createMany({ data: fakeReferralTypes });
  await prisma.data_owner.createMany({ data: fakeDataOwner });
}

function readAndParseJsonFile(path: string) {
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
