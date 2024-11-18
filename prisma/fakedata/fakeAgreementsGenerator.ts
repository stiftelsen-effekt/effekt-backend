import { faker } from "@faker-js/faker";
import {
  Avtalegiro_agreements,
  Vipps_agreements,
  AutoGiro_agreements,
  AutoGiro_mandates,
  Donations,
  Distributions,
  Tax_unit,
} from "@prisma/client";

const PAYMENT_METHODS = {
  AVTALEGIRO: 7,
  VIPPS_RECURRING: 8,
  AUTOGIRO: 12,
} as const;

interface AgreementGeneratorResult {
  avtalegiroAgreements: Avtalegiro_agreements[];
  vippsAgreements: Vipps_agreements[];
  autoGiroAgreements: AutoGiro_agreements[];
  autoGiroMandates: AutoGiro_mandates[];
}

export function generateAgreementsForDonations(
  donations: Donations[],
  distributions: Distributions[],
  taxUnits: Tax_unit[],
): AgreementGeneratorResult {
  const avtalegiroAgreements: Avtalegiro_agreements[] = [];
  const vippsAgreements: Vipps_agreements[] = [];
  const autoGiroAgreements: AutoGiro_agreements[] = [];
  const autoGiroMandates: AutoGiro_mandates[] = [];

  // First, group donations by KID and payment method
  const donationsByKIDAndPayment = donations.reduce((acc, donation) => {
    const key = `${donation.KID_fordeling}-${donation.Payment_ID}`;
    if (!acc[key]) {
      acc[key] = {
        kid: donation.KID_fordeling,
        paymentId: donation.Payment_ID,
        donations: [],
      };
    }
    acc[key].donations.push(donation);
    return acc;
  }, {} as Record<string, { kid: string; paymentId: number; donations: Donations[] }>);

  // Process each group
  Object.values(donationsByKIDAndPayment).forEach(({ kid, paymentId, donations }) => {
    // Find associated distribution and tax unit
    const distribution = distributions.find((d) => d.KID === kid);
    if (!distribution) return;

    const taxUnit = taxUnits.find((t) => t.ID === distribution.Tax_unit_ID);
    const latestDonation = donations.reduce((latest, current) =>
      latest.timestamp_confirmed > current.timestamp_confirmed ? latest : current,
    );

    switch (paymentId) {
      case PAYMENT_METHODS.AVTALEGIRO:
        const avtaleAgreement = generateAvtalegiroAgreement(
          avtalegiroAgreements.length + 1,
          kid,
          donations[0],
          latestDonation,
        );
        avtalegiroAgreements.push(avtaleAgreement);
        break;

      case PAYMENT_METHODS.VIPPS_RECURRING:
        const vippsAgreement = generateVippsAgreement(
          `VA_${vippsAgreements.length + 1}`,
          kid,
          distribution.Donor_ID,
          donations[0],
          latestDonation,
        );
        vippsAgreements.push(vippsAgreement);
        break;

      case PAYMENT_METHODS.AUTOGIRO:
        const mandateId = autoGiroMandates.length + 1;
        const mandate = generateAutoGiroMandate(mandateId, kid, taxUnit);
        autoGiroMandates.push(mandate);

        const autoAgreement = generateAutoGiroAgreement(
          autoGiroAgreements.length + 1,
          mandateId,
          kid,
          donations[0],
          latestDonation,
        );
        autoGiroAgreements.push(autoAgreement);
        break;
    }
  });

  return {
    avtalegiroAgreements,
    vippsAgreements,
    autoGiroAgreements,
    autoGiroMandates,
  };
}

function generateAvtalegiroAgreement(
  id: number,
  kid: string,
  firstDonation: Donations,
  lastDonation: Donations,
): Avtalegiro_agreements {
  const isActive = faker.datatype.boolean();
  const created = new Date(firstDonation.timestamp_confirmed);
  const lastUpdated = new Date(lastDonation.timestamp_confirmed);

  let cancelled: Date | null = null;
  if (!isActive) {
    cancelled = faker.date.between({
      from: lastDonation.timestamp_confirmed,
      to: new Date(),
    });
  }

  return {
    ID: id,
    KID: kid,
    amount: Number(firstDonation.sum_confirmed) * 100,
    payment_date: faker.number.int({ min: 1, max: 28 }),
    notice: faker.datatype.boolean(),
    active: isActive,
    created,
    last_updated: lastUpdated,
    cancelled,
  };
}

function generateVippsAgreement(
  id: string,
  kid: string,
  donorId: number,
  firstDonation: Donations,
  lastDonation: Donations,
): Vipps_agreements {
  const isActive = faker.datatype.boolean();
  const created = new Date(firstDonation.timestamp_confirmed);

  let cancellationDate: Date | null = null;
  if (!isActive) {
    cancellationDate = faker.date.between({
      from: lastDonation.timestamp_confirmed,
      to: new Date(),
    });
  }

  return {
    ID: id,
    donorID: donorId,
    KID: kid,
    amount: Number(firstDonation.sum_confirmed),
    status: isActive ? "active" : "stopped",
    monthly_charge_day: faker.number.int({ min: 1, max: 28 }),
    paused_until_date: null,
    agreement_url_code: faker.string.alphanumeric(32),
    timestamp_created: created,
    force_charge_date: null,
    cancellation_date: cancellationDate,
  };
}

function generateAutoGiroMandate(
  id: number,
  kid: string,
  taxUnit: Tax_unit | null,
): AutoGiro_mandates {
  return {
    ID: id,
    status: faker.helpers.arrayElement(["active", "pending", "stopped"]),
    last_updated: faker.date.recent(),
    created: faker.date.past(),
    bank_account: faker.string.numeric(16),
    special_information: faker.helpers.maybe(() => faker.lorem.sentence()),
    name_and_address: taxUnit?.full_name ?? faker.person.fullName(),
    postal_code: faker.location.zipCode(),
    postal_label: faker.location.city(),
    KID: kid,
  };
}

function generateAutoGiroAgreement(
  id: number,
  mandateId: number,
  kid: string,
  firstDonation: Donations,
  lastDonation: Donations,
): AutoGiro_agreements {
  const isActive = faker.datatype.boolean();
  const created = new Date(firstDonation.timestamp_confirmed);
  const lastUpdated = new Date(lastDonation.timestamp_confirmed);

  let cancelled: Date | null = null;
  if (!isActive) {
    cancelled = faker.date.between({
      from: lastDonation.timestamp_confirmed,
      to: new Date(),
    });
  }

  return {
    ID: id,
    mandateID: mandateId,
    KID: kid,
    amount: Number(firstDonation.sum_confirmed) * 100,
    payment_date: faker.number.int({ min: 1, max: 28 }),
    notice: faker.datatype.boolean(),
    active: isActive,
    last_updated: lastUpdated,
    created,
    cancelled,
  };
}
