import { faker } from "@faker-js/faker";
import {
  Combining_table,
  Distribution,
  Donations,
  Donors,
  Organizations,
  Payment,
  Payment_intent,
  Prisma,
  Tax_unit,
} from "@prisma/client";
import { KID } from "../../src/custom_modules/KID";

export function generateFakeDonor(donorID: number): Donors {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const email = faker.internet.email({ firstName: firstName, lastName: lastName });

  return {
    ID: donorID,
    email: email,
    full_name: `${firstName} ${lastName}`,
    password_hash: null,
    password_salt: null,
    newsletter: faker.helpers.maybe(() => faker.datatype.boolean()) ?? null,
    trash: faker.helpers.maybe(() => faker.number.int({ min: 0, max: 1 })) ?? null,
    Meta_owner_ID: 3,
    date_registered: faker.date.past({ years: 3 }),
    ssn: null,
  };
}

export function generateFakeDonation(
  donor: Donors,
  donationID: number,
  payments: Payment[],
): Donations {
  const payment = faker.helpers.arrayElement(payments);
  const donationSum = faker.number.int({ min: 0, max: 10000 });
  const percentageFee: number = Number(payment.percentage_fee) ?? 0;
  const flatFee: number = Number(payment.flat_fee) ?? 0;
  const donationTransactionCost = donationSum * (percentageFee / 100) + flatFee;

  const dateConfirmed: Date = faker.date.between({ from: donor.date_registered, to: new Date() });
  const fakeKID: string = KID.generate(15, donor.ID as any);

  return {
    ID: donationID,
    Donor_ID: donor.ID,
    Payment_ID: payment.ID,
    PaymentExternal_ID: faker.helpers.maybe(() => faker.string.numeric(8)) ?? null, //TODO: This value is perhaps needed for other parts of testdata
    sum_confirmed: new Prisma.Decimal(donationSum),
    timestamp_confirmed: dateConfirmed,
    transaction_cost: new Prisma.Decimal(donationTransactionCost),
    KID_fordeling: fakeKID,
    inserted: offsetDateByHours(dateConfirmed, 16),
    last_updated: offsetDateByHours(dateConfirmed, 48),
    Meta_owner_ID: 3,
  };
}

function offsetDateByHours(date: Date, offsetHours: number): Date {
  const finalDate: Date = new Date(date);
  finalDate.setHours(finalDate.getHours() + offsetHours);
  return finalDate;
}

export function generateFakeDistribution(
  initialDistributionID: number,
  organizations: Organizations[],
): Distribution[] {
  let distributionID: number = initialDistributionID;
  const arrayOfDistributions: Distribution[] = [];

  getRandomPercentageArrayThatSumsTo100().forEach((percentage) => {
    arrayOfDistributions.push({
      ID: distributionID,
      OrgID: faker.helpers.arrayElement(organizations).ID,
      percentage_share: new Prisma.Decimal(percentage),
    });
    distributionID += 1;
  });

  return arrayOfDistributions;
}

function getRandomPercentageArrayThatSumsTo100(): number[] {
  let percentageSum = 0;
  let percentageOptionsArray: number[] = [100.0, 100.0, 100.0, 90.0, 80.0, 70.0, 30.0, 20.0, 10.0];
  const finalPercentageArray: number[] = [];
  const removeInvalidPercentages = (percentage: number) => 100 - percentageSum >= percentage;

  while (percentageSum < 100) {
    const percentageShare: number = faker.helpers.arrayElement(percentageOptionsArray);

    finalPercentageArray.push(percentageShare);
    percentageSum += percentageShare;
    percentageOptionsArray = percentageOptionsArray.filter(removeInvalidPercentages);
  }
  return finalPercentageArray;
}

export function generateCombiningTable(
  donorID: number,
  distributionID: number,
  taxUnitID: number,
  donation: Donations,
): Combining_table {
  return {
    Donor_ID: donorID,
    Distribution_ID: distributionID,
    Tax_unit_ID: taxUnitID,
    KID: donation.KID_fordeling,
    timestamp_created: donation.timestamp_confirmed,
    Meta_owner_ID: 3,
    Replaced_old_organizations: null,
    Standard_split: faker.datatype.boolean(0.4),
  };
}

export function generateFakeTaxUnit(id: number, donor: Donors): Tax_unit {
  return {
    ID: id,
    Donor_ID: donor.ID,
    ssn: faker.string.numeric(11),
    full_name: donor.full_name ?? "",
    archived: null,
    registered: donor.date_registered,
  };
}

export function generateFakePaymentIntent(ID: number, donation: Donations): Payment_intent {
  return {
    Id: ID,
    KID_fordeling: donation.KID_fordeling,
    Payment_method: donation.Payment_ID.toString(),
    timetamp: donation.inserted,
  };
}
