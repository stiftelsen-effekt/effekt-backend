import { DateTime } from "luxon";
import { DAO } from "./DAO";
import { VippsAgreement } from "./DAO_modules/vipps";
import { sendAgreementInflationAdjustment } from "./mail";

export enum agreementType {
  avtaleGiro = "avtaleGiro",
  autoGiro = "autoGiro",
  vipps = "vipps",
}

// Type definitions for our unified agreement interface
interface BaseAgreement {
  ID: number | string;
  amount: number;
  last_updated: Date;
  type: "avtaleGiro" | "autoGiro" | "vipps";
}

interface AgreementWithInflationData extends BaseAgreement {
  currentInflationAdjustedAmount: number;
  absoluteIncrease: number;
  percentageIncrease: number;
}

// Constants
const MINIMUM_INCREASE_NOK = 10;
const MINIMUM_INFLATION_PERCENTAGE = 0.05;
const MINIMUM_MONTHS_SINCE_UPDATE = 12;

const inflationYearMonthCache = new Map<string, number>();

/**
 * Utility function
 * Returns inflation percentage between two dates
 */
async function getInflationPercentage(fromDate: Date, toDate: Date): Promise<number> {
  const fromYearMonth = `${fromDate.getFullYear()}-${fromDate.getMonth()}`;
  if (!inflationYearMonthCache.has(fromYearMonth)) {
    // Fetch inflation data
    let attempts = 0;
    let start = DateTime.fromJSDate(fromDate);
    let end = DateTime.fromJSDate(toDate);
    while (attempts < 12) {
      end = end.minus({ months: 1 });
      const inflation = await fetch(
        `https://www.ssb.no/priser-og-prisindekser/konsumpriser/statistikk/konsumprisindeksen/_/service/mimir/kpi?startValue=100&startYear=${
          start.year
        }&startMonth=${start.month.toString().padStart(2, "0")}&endYear=${
          end.year
        }&endMonth=${end.month.toString().padStart(2, "0")}&language=nb`,
      );
      const json = await inflation.json();

      if ("change" in json && json.change !== "NaN") {
        inflationYearMonthCache.set(fromYearMonth, json.change);
        return json.change;
      }
      attempts++;
    }
    throw new Error("Failed to fetch inflation data");
  }
  return inflationYearMonthCache.get(fromYearMonth) as number;
}

/**
 * Check if an agreement is eligible for inflation adjustment
 */
async function isEligibleForAdjustment(
  agreement: BaseAgreement,
  now: DateTime,
): Promise<AgreementWithInflationData | null> {
  const lastUpdated = DateTime.fromJSDate(agreement.last_updated);
  const monthsSinceUpdate = now.diff(lastUpdated, "months").months;

  // Skip if updated too recently
  if (monthsSinceUpdate < MINIMUM_MONTHS_SINCE_UPDATE) {
    return null;
  }

  // Get inflation since last update
  const inflationPercentage = await getInflationPercentage(agreement.last_updated, now.toJSDate());

  // Skip if inflation is too low
  if (inflationPercentage < MINIMUM_INFLATION_PERCENTAGE) {
    return null;
  }

  // Calculate new amount
  let newAmount = agreement.amount * (1 + inflationPercentage);
  let absoluteIncrease = newAmount - agreement.amount;

  // Round end result to nearest 10
  let newAmountRounded = Math.round(newAmount / 10) * 10;
  absoluteIncrease = newAmountRounded - agreement.amount;

  // Check if increase meets minimum threshold
  if (absoluteIncrease < MINIMUM_INCREASE_NOK) {
    return null;
  }

  return {
    ...agreement,
    currentInflationAdjustedAmount: newAmountRounded,
    absoluteIncrease: Math.round(absoluteIncrease),
    percentageIncrease: inflationPercentage,
  };
}

/**
 * Fetch and process agreements from all sources
 */
export async function getAllInflationEligibleAgreements() {
  const now = DateTime.now();

  // Assume these DAO calls exist
  let [avtaleGiroAgreements, autoGiroAgreements, vippsAgreements] = await Promise.all([
    DAO.avtalegiroagreements.getActiveAgreements(),
    DAO.autogiroagreements.getActiveAgreements(),
    DAO.vipps.getActiveAgreements(),
  ]);

  if (!vippsAgreements) {
    vippsAgreements = [];
  }

  // Filter out agreements that have pending adjusment rows in DB
  const existingAdjustments = await DAO.inflationadjustments.getAllExisting();

  const pendingAgreementIDsSet = new Set(
    existingAdjustments.map(
      (adjustment) => `${adjustment.agreement_type}-${adjustment.agreement_ID}`,
    ),
  );
  avtaleGiroAgreements = avtaleGiroAgreements.filter(
    (agreement) => !pendingAgreementIDsSet.has(`${agreementType.avtaleGiro}-${agreement.ID}`),
  );

  autoGiroAgreements = autoGiroAgreements.filter(
    (agreement) => !pendingAgreementIDsSet.has(`${agreementType.autoGiro}-${agreement.ID}`),
  );

  vippsAgreements = vippsAgreements.filter(
    (agreement) => !pendingAgreementIDsSet.has(`${agreementType.vipps}-${agreement.ID}`),
  );

  // Process each type of agreement
  const eligibleAgreements = {
    avtaleGiro: [] as AgreementWithInflationData[],
    autoGiro: [] as AgreementWithInflationData[],
    vipps: [] as AgreementWithInflationData[],
  };

  // Process AvtaleGiro agreements
  for (const agreement of avtaleGiroAgreements) {
    const eligible = await isEligibleForAdjustment(
      {
        ...agreement,
        amount: agreement.amount / 100,
        type: agreementType.avtaleGiro,
      },
      now,
    );
    if (eligible) {
      eligibleAgreements.avtaleGiro.push(eligible);
    }
  }

  // Process AutoGiro agreements
  for (const agreement of autoGiroAgreements) {
    const eligible = await isEligibleForAdjustment(
      {
        ...agreement,
        amount: agreement.amount / 100,
        type: agreementType.autoGiro,
      },
      now,
    );
    if (eligible) {
      eligibleAgreements.autoGiro.push(eligible);
    }
  }

  // Process Vipps agreements
  for (const agreement of vippsAgreements) {
    const eligible = await isEligibleForAdjustment(
      {
        ...mapVippsAgreement(agreement),
        type: agreementType.vipps,
      },
      now,
    );
    if (eligible) {
      eligibleAgreements.vipps.push(eligible);
    }
  }

  // Add pending adjustments for eligible agreements
  for (const eligibleAgreement of eligibleAgreements.avtaleGiro) {
    await DAO.inflationadjustments.createAdjustment({
      agreementId: eligibleAgreement.ID,
      agreementType: agreementType.avtaleGiro,
      currentAmount: eligibleAgreement.amount * 100,
      proposedAmount: eligibleAgreement.currentInflationAdjustedAmount * 100,
      inflationPercentage: eligibleAgreement.percentageIncrease,
    });
  }

  for (const eligibleAgreement of eligibleAgreements.autoGiro) {
    await DAO.inflationadjustments.createAdjustment({
      agreementId: eligibleAgreement.ID,
      agreementType: agreementType.autoGiro,
      currentAmount: eligibleAgreement.amount * 100,
      proposedAmount: eligibleAgreement.currentInflationAdjustedAmount * 100,
      inflationPercentage: eligibleAgreement.percentageIncrease,
    });
  }

  for (const eligibleAgreement of eligibleAgreements.vipps) {
    await DAO.inflationadjustments.createAdjustment({
      agreementId: eligibleAgreement.ID,
      agreementType: agreementType.vipps,
      currentAmount: eligibleAgreement.amount * 100,
      proposedAmount: eligibleAgreement.currentInflationAdjustedAmount * 100,
      inflationPercentage: eligibleAgreement.percentageIncrease,
    });
  }

  // Now loop over all new adjustments and send emails to donors
  const newAdjustments = await DAO.inflationadjustments.getAllNew();

  // Get a selection of 10 random adjustments
  const randomNewAdjustments = newAdjustments.sort(() => 0.5 - Math.random()).slice(0, 10);

  console.log(randomNewAdjustments);

  for (const adjustment of randomNewAdjustments) {
    // Send email to donor
    try {
      await sendAgreementInflationAdjustment(adjustment);
      await DAO.inflationadjustments.setPending(adjustment.ID);
    } catch (e) {
      console.error("Failed to send email", e);
    }
  }

  return eligibleAgreements;
}

const mapVippsAgreement = (agreement: VippsAgreement): BaseAgreement => {
  return {
    ID: agreement.ID,
    amount: agreement.amount,
    last_updated: new Date(agreement.timestamp_created),
    type: "vipps",
  };
};
