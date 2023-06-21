import {
  Combining_table,
  Data_owner,
  Distribution,
  Donations,
  Donors,
  Organizations,
  Payment,
  Payment_intent,
  PrismaClient,
  Referral_types,
  Tax_unit,
} from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const basePath: string = path.resolve(__dirname, "./fakedata/json/");

async function main() {
  const fakeDonors: Donors[] = readAndParseJsonFile("/fakeDonors.json");
  const fakePayments: Payment[] = readAndParseJsonFile("/fakePayments.json");
  const fakeOrganizations: Organizations[] = readAndParseJsonFile("/fakeOrganizations.json");
  const fakeTaxUnits: Tax_unit[] = readAndParseJsonFile("/fakeTaxUnits.json");
  const fakeDonations: Donations[] = readAndParseJsonFile("/fakeDonations.json");
  const fakePaymentIntents: Payment_intent[] = readAndParseJsonFile("/fakePaymentIntents.json");
  const fakeDistributions: Distribution[] = readAndParseJsonFile("/fakeDistributions.json");
  const fakeCombiningTables: Combining_table[] = readAndParseJsonFile("/fakeCombiningTables.json");
  const fakeReferralTypes: Referral_types[] = readAndParseJsonFile("/fakeReferralTypes.json");
  const fakeDataOwner: Data_owner[] = readAndParseJsonFile("/fakeDataOwner.json");

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
