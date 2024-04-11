import { faker } from "@faker-js/faker";
import {
  Distributions,
  Distribution_cause_areas,
  Distribution_cause_area_organizations,
  Donations,
  Donors,
  Organizations,
  Payment,
  Payment_intent,
  Prisma,
  Tax_unit,
  Cause_areas,
} from "@prisma/client";
import { KID } from "../../src/custom_modules/KID";

const getRandomArrayThatSumsTo100 = (elements: number): number[] => {
  const arrayOfNumbers: number[] = [];
  let sum: number = 0;

  for (let i = 0; i < elements; i++) {
    let randomNumber: number = faker.number.int({ min: Math.min(10, 100 - sum), max: 100 - sum });
    if (sum + randomNumber > 100) {
      randomNumber = 100 - sum;
    }
    arrayOfNumbers.push(randomNumber);
    sum += randomNumber;
  }

  if (sum < 100) {
    arrayOfNumbers[0] = arrayOfNumbers[0] + (100 - sum);
  }

  return arrayOfNumbers;
};

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
  donorId: number,
  taxUnitId: number,
  donation: Donations,
  causeAreas: Cause_areas[],
  organizations: Organizations[],
  lastDistributionCauseAreasId: number,
  lastDistributionCauseAreaOrganizationsId: number,
): {
  distribution: Distributions;
  distributionCauseAreas: Distribution_cause_areas[];
  distributionCauseAreaOrganizations: Distribution_cause_area_organizations[];
} {
  const distribution: Distributions = {
    Donor_ID: donorId,
    Tax_unit_ID: taxUnitId,
    KID: donation.KID_fordeling,
    inserted: donation.timestamp_confirmed,
    last_updated: donation.timestamp_confirmed,
    Meta_owner_ID: 3,
    Replaced_old_organizations: false,
  };

  const distributionCauseAreaOrganizations: Distribution_cause_area_organizations[] = [];
  const distributionCauseAreas: Distribution_cause_areas[] = [];

  const numberOfCauseAreas = faker.number.int({ min: 1, max: Math.min(causeAreas.length, 10) });
  const causeAreaIdsSet = new Set(causeAreas.map((causeArea) => causeArea.ID));
  const causeAreaPercentages = getRandomArrayThatSumsTo100(numberOfCauseAreas);

  for (let i = 0; i < numberOfCauseAreas; i++) {
    // Pick random cause area and remove from set
    const causeAreaId: number = faker.helpers.arrayElement([...causeAreaIdsSet]);
    causeAreaIdsSet.delete(causeAreaId);

    const isStandard = faker.datatype.boolean();

    distributionCauseAreas.push({
      ID: lastDistributionCauseAreasId + i + 1,
      Distribution_KID: distribution.KID,
      Cause_area_ID: causeAreaId,
      Standard_split: isStandard,
      Percentage_share: new Prisma.Decimal(causeAreaPercentages[i]),
    });

    const filteredOrganizations = organizations.filter(
      (organization) => organization.cause_area_ID === causeAreaId,
    );

    if (!isStandard) {
      const numberOfOrganizations = faker.number.int({
        min: 1,
        max: Math.min(filteredOrganizations.length, 10),
      });

      const organizationIdsSet = new Set(
        filteredOrganizations.map((organization) => organization.ID),
      );
      const organizationPercentages = getRandomArrayThatSumsTo100(numberOfOrganizations);

      for (let j = 0; j < numberOfOrganizations; j++) {
        // Pick random organization and remove from set
        const organizationId: number = faker.helpers.arrayElement([...organizationIdsSet]);
        organizationIdsSet.delete(organizationId);

        distributionCauseAreaOrganizations.push({
          ID:
            lastDistributionCauseAreaOrganizationsId +
            distributionCauseAreaOrganizations.length +
            1,
          Distribution_cause_area_ID: distributionCauseAreas[i].ID,
          Organization_ID: organizationId,
          Percentage_share: new Prisma.Decimal(organizationPercentages[j]),
        });
      }
    } else {
      for (let j = 0; j < filteredOrganizations.length; j++) {
        const organization = filteredOrganizations[j];
        if (organization.std_percentage_share === null || organization.std_percentage_share == 0) {
          continue;
        }
        distributionCauseAreaOrganizations.push({
          ID:
            lastDistributionCauseAreaOrganizationsId +
            distributionCauseAreaOrganizations.length +
            1,
          Distribution_cause_area_ID: distributionCauseAreas[i].ID,
          Organization_ID: organization.ID,
          Percentage_share: new Prisma.Decimal(organization.std_percentage_share),
        });
      }
    }
  }

  return { distribution, distributionCauseAreas, distributionCauseAreaOrganizations };
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
    Payment_method: donation.Payment_ID,
    Payment_amount: donation.sum_confirmed,
    timetamp: donation.inserted,
    timestamp: donation.inserted,
  };
}
