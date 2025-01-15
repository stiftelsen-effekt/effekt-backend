import {
  AutoGiro_agreements,
  AutoGiro_mandates,
  Avtalegiro_agreements,
  Cause_areas,
  Data_owner,
  Distribution_cause_area_organizations,
  Distribution_cause_areas,
  Distributions,
  Donations,
  Donors,
  Organizations,
  Payment,
  Payment_intent,
  PrismaClient,
  Referral_types,
  Tax_unit,
  Vipps_agreements,
} from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const basePath: string = path.resolve(__dirname, "./fakedata/json/");

async function main() {
  const fakeDonors: Donors[] = readAndParseJsonFile("/fakeDonors.json");
  const fakePayments: Payment[] = readAndParseJsonFile("/fakePayments.json");
  const fakeCauseAreas: Cause_areas[] = readAndParseJsonFile("/fakeCauseAreas.json");
  const fakeOrganizations: Organizations[] = readAndParseJsonFile("/fakeOrganizations.json");
  const fakeTaxUnits: Tax_unit[] = readAndParseJsonFile("/fakeTaxUnits.json");
  const fakeDonations: Donations[] = readAndParseJsonFile("/fakeDonations.json");
  const fakePaymentIntents: Payment_intent[] = readAndParseJsonFile("/fakePaymentIntents.json");
  const fakeDistributions: Distributions[] = readAndParseJsonFile("/fakeDistributions.json");
  const fakeDistributionCauseAreas: Distribution_cause_areas[] = readAndParseJsonFile(
    "/fakeDistributionCauseAreas.json",
  );
  const fakeDistributionCauseAreaOrganizations: Distribution_cause_area_organizations[] =
    readAndParseJsonFile("/fakeDistributionCauseAreaOrganizations.json");
  const fakeReferralTypes: Referral_types[] = readAndParseJsonFile("/fakeReferralTypes.json");
  const fakeDataOwner: Data_owner[] = readAndParseJsonFile("/fakeDataOwner.json");
  const fakeAvtalegiroAgreements: Avtalegiro_agreements[] = readAndParseJsonFile(
    "/fakeAvtalegiroAgreements.json",
  );
  const fakeVippsAgreements: Vipps_agreements[] = readAndParseJsonFile("/fakeVippsAgreements.json");
  const fakeAutoGiroMandates: AutoGiro_mandates[] = readAndParseJsonFile(
    "/fakeAutoGiroMandates.json",
  );
  const fakeAutoGiroAgreements: AutoGiro_agreements[] = readAndParseJsonFile(
    "/fakeAutoGiroAgreements.json",
  );

  await prisma.data_owner.createMany({ data: fakeDataOwner });
  await prisma.payment.createMany({ data: fakePayments });
  await prisma.donors.createMany({ data: fakeDonors });
  await prisma.cause_areas.createMany({ data: fakeCauseAreas });
  await prisma.organizations.createMany({ data: fakeOrganizations });
  await prisma.tax_unit.createMany({ data: fakeTaxUnits });
  await prisma.distributions.createMany({ data: fakeDistributions });
  await prisma.distribution_cause_areas.createMany({ data: fakeDistributionCauseAreas });
  await prisma.distribution_cause_area_organizations.createMany({
    data: fakeDistributionCauseAreaOrganizations,
  });
  await prisma.avtalegiro_agreements.createMany({ data: fakeAvtalegiroAgreements });
  await prisma.vipps_agreements.createMany({ data: fakeVippsAgreements });
  await prisma.autoGiro_mandates.createMany({ data: fakeAutoGiroMandates });
  await prisma.autoGiro_agreements.createMany({ data: fakeAutoGiroAgreements });
  await prisma.donations.createMany({ data: fakeDonations });
  await prisma.payment_intent.createMany({ data: fakePaymentIntents });
  await prisma.referral_types.createMany({ data: fakeReferralTypes });
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
