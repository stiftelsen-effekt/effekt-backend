import type { TrpcClient } from "../../../../../lib/trpc/client";
import { Distribution } from "../../../../../models";
import { AgreementTypes } from "./AgreementList";

/** The split the agreement mutations take: the donor is the agreement's, names and amounts are left out */
const toAgreementDistribution = (distribution: Distribution) => ({
  taxUnitId: distribution.taxUnitId ?? null,
  causeAreas: distribution.causeAreas.map((causeArea) => ({
    id: causeArea.id,
    standardSplit: causeArea.standardSplit,
    percentageShare: String(causeArea.percentageShare),
    organizations: causeArea.organizations.map((organization) => ({
      id: organization.id,
      percentageShare: String(organization.percentageShare),
    })),
  })),
});

/** Runs a Min Side mutation; true when it succeeded, null when it failed (as the REST calls did) */
const succeeded = async (mutation: Promise<unknown>): Promise<true | null> => {
  try {
    await mutation;
    return true;
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const updateVippsAgreementDistribution = (
  trpc: TrpcClient,
  donorId: number,
  agreementId: string,
  distribution: Distribution,
) =>
  succeeded(
    trpc.minside.updateVippsAgreementDistribution.mutate({
      donorId,
      agreementId,
      distribution: toAgreementDistribution(distribution),
    }),
  );

/** `sum` in whole kroner */
export const updateVippsAgreementPrice = (
  trpc: TrpcClient,
  donorId: number,
  agreementId: string,
  sum: number,
) =>
  succeeded(trpc.minside.updateVippsAgreementPrice.mutate({ donorId, agreementId, amount: sum }));

export const updateVippsAgreementDay = (
  trpc: TrpcClient,
  donorId: number,
  agreementId: string,
  day: number,
) =>
  succeeded(
    trpc.minside.updateVippsAgreementChargeDay.mutate({ donorId, agreementId, chargeDay: day }),
  );

export const cancelVippsAgreement = (trpc: TrpcClient, donorId: number, agreementId: string) =>
  succeeded(trpc.minside.cancelVippsAgreement.mutate({ donorId, agreementId }));

export const updateAvtalegiroAgreementDistribution = (
  trpc: TrpcClient,
  donorId: number,
  kid: string,
  distribution: Distribution,
) =>
  succeeded(
    trpc.minside.updateAvtaleGiroDistribution.mutate({
      donorId,
      KID: kid,
      distribution: toAgreementDistribution(distribution),
    }),
  );

export const updateAvtaleagreementPaymentDay = (
  trpc: TrpcClient,
  donorId: number,
  kid: string,
  day: number,
) =>
  succeeded(
    trpc.minside.updateAvtaleGiroPaymentDate.mutate({ donorId, KID: kid, paymentDate: day }),
  );

/** `sum` in whole kroner */
export const updateAvtaleagreementAmount = (
  trpc: TrpcClient,
  donorId: number,
  kid: string,
  sum: number,
) => succeeded(trpc.minside.updateAvtaleGiroAmount.mutate({ donorId, KID: kid, amount: sum }));

export const updateDKAgreement = async (
  donorId: number,
  agreementId: string,
  distribution: Distribution | null,
  chargeDay: number | null,
  amount: number | null,
  token: string,
) => {
  const api = process.env.NEXT_PUBLIC_EFFEKT_API || "http://localhost:5050";

  try {
    const response = await fetch(`${api}/donors/${donorId}/recurring?id=${agreementId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "same-origin",
      body: JSON.stringify({
        distribution,
        chargeDay,
        amount,
      }),
    });

    if (response.status !== 200) {
      return null;
    } else {
      return true;
    }
  } catch {
    return null;
  }
};

export const cancelDKAgreement = async (donorId: number, agreementId: string, token: string) => {
  const api = process.env.NEXT_PUBLIC_EFFEKT_API || "http://localhost:5050";

  try {
    const response = await fetch(`${api}/donors/${donorId}/recurring/cancel?id=${agreementId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "same-origin",
    });

    if (response.status !== 200) {
      return null;
    } else {
      return true;
    }
  } catch {
    return null;
  }
};

export const cancelAvtaleGiroAgreement = (trpc: TrpcClient, donorId: number, kid: string) =>
  succeeded(trpc.minside.cancelAvtaleGiroAgreement.mutate({ donorId, KID: kid }));

export const addStoppedAgreementFeedback = async (
  agreementId: string,
  KID: string,
  agreementType: AgreementTypes,
  reasonId: number,
  otherComment: string | undefined,
  token: string,
) => {
  const api = process.env.NEXT_PUBLIC_EFFEKT_API || "http://localhost:5050";

  try {
    const response = await fetch(`${api}/agreementfeedback/stopped/${KID}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "same-origin",
      body: JSON.stringify({
        agreementId: agreementId,
        agreementType: agreementType,
        reasonId: reasonId,
        otherComment: otherComment,
      }),
    });

    const result = await response.json();
    if (response.status !== 200) {
      throw new Error("Failed to add feedback");
    } else {
      return result.content; // Inserted id of the feedback record in DB
    }
  } catch (e) {
    throw new Error("Failed to add feedback");
  }
};

export const deleteStoppedAgreementFeedback = async (
  feedbackId: string,
  KID: string,
  token: string,
) => {
  const api = process.env.NEXT_PUBLIC_EFFEKT_API || "http://localhost:5050";

  try {
    const response = await fetch(`${api}/agreementfeedback/stopped/${KID}/${feedbackId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "same-origin",
    });

    // It's also okay if the feedback is not found, as it might have been deleted already
    if (response.status !== 200 && response.status !== 404) {
      throw new Error("Failed to delete feedback");
    } else {
      return true;
    }
  } catch (e) {
    throw new Error("Failed to delete feedback");
  }
};
