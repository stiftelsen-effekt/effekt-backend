import { useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { useMainLocale } from "../../../../../context/MainLocaleContext";
import {
  apiFlavorFor,
  publicTrpcFor,
  type ApiFlavor,
  type TrpcClient,
} from "../../../../../lib/trpc/client";
import { PaymentMethod, RecurringDonation } from "../../../../shared/components/Widget/types/Enums";
import { API_URL } from "../../../../shared/components/Widget/config/api";
import {
  AVTALEGIRO_COMPANY_ACCOUNT_NO,
  AVTALEGIRO_COMPANY_NAME,
  AVTALEGIRO_FORM_URL,
  AVTALEGIRO_MIN_AMOUNT_LIMIT,
} from "../../../../shared/components/Widget/config/avtalegiro";
import { getFirstAvtaleGiroCharge } from "../avtaleGiroFirstCharge";
import { ANONYMOUS_DONOR } from "../../../../shared/components/Widget/config/anonymous-donor";
import { FormData } from "./useFundraiserForm";
import { paymentMethodMap } from "../../../../shared/components/Widget/components/panes/DonorPane/DonorPane";
import {
  getReferralCodeFromLocation,
  getStoredReferralCode,
} from "../../../../../util/referralCode";

interface UseRegisterDonationProps {
  fundraiserId: string;
  organizationInfo: {
    databaseIds: {
      causeAreaId: number;
      organizationId: number;
    };
  };
  paymentMethods: Array<{
    _id?: string;
    _type: string;
  }>;
  onSuccess: (kid: string) => void;
}

// The fundraiser widget has no charge day picker. Vipps charges the first donation straight
// away, so later charges are on today's day of the month, capped at the 28th so every month
// has the day
const todayAsChargeDay = () => Math.min(new Date().getDate(), 28);

const draftVippsAgreement = async (
  trpc: TrpcClient,
  kid: string,
  amount: number,
  registrationToken: string,
) => {
  const { vippsConfirmationUrl } = await trpc.widget.draftVippsAgreement.mutate({
    KID: kid,
    amount,
    registrationToken,
    initialCharge: true,
    monthlyChargeDay: todayAsChargeDay(),
  });
  // nosemgrep: javascript.browser.security.open-redirect-from-function.js-open-redirect-from-function -- the Vipps confirmation URL comes from our API, not from user input
  window.location.href = vippsConfirmationUrl;
};

const draftAvtaleGiro = async (
  trpc: TrpcClient,
  kid: string,
  amount: number,
  registrationToken: string,
) => {
  try {
    await trpc.widget.draftAvtaleGiro.mutate({
      KID: kid,
      amount,
      registrationToken,
      dueDay: getFirstAvtaleGiroCharge().dueDay,
    });
  } catch (err) {
    throw new Error("Drafting AvtaleGiro failed", { cause: err });
  }

  // Hand the donor over to Nets to sign the agreement in their bank
  const form = document.createElement("form");
  form.action = AVTALEGIRO_FORM_URL;
  form.method = "post";
  form.target = "_parent";
  const fields: Record<string, string> = {
    companyName: AVTALEGIRO_COMPANY_NAME,
    companyAccountNo: AVTALEGIRO_COMPANY_ACCOUNT_NO,
    kid,
    amountLimit: Math.max(amount, AVTALEGIRO_MIN_AMOUNT_LIMIT).toString(),
    returnUrl: `${API_URL}/avtalegiro/${kid}/redirect`,
    notificationDisabled: "false",
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
};

type RegisterResult =
  | {
      ok: true;
      content: {
        KID?: string | null;
        paymentProviderUrl?: string | null;
        registrationToken?: string | null;
      };
    }
  | { ok: false; error: unknown };

/**
 * Registers the fundraiser gift: tRPC widget.registerDonation (the procedure the donation widget
 * uses), or on the Danish site the original REST request, since the Danish /donations/register
 * takes and answers a different shape (see Widget/store/widgetApi.ts). A refusal resolves
 * `ok: false`; a network failure rejects.
 */
const registerFundraiserDonation = async (
  flavor: ApiFlavor,
  trpc: TrpcClient,
  donation: Record<string, unknown>,
): Promise<RegisterResult> => {
  if (flavor === "rest") {
    const data = await fetch(`${API_URL}/donations/register`, {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(donation),
      method: "POST",
    }).then((res) => res.json());
    return data.status === 200
      ? { ok: true, content: data.content }
      : { ok: false, error: data.content };
  }
  try {
    return { ok: true, content: await trpc.widget.registerDonation.mutate(donation as any) };
  } catch (err) {
    if (err instanceof TRPCClientError && err.data?.httpStatus !== undefined) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
};

export function useRegisterDonation({
  fundraiserId,
  organizationInfo,
  paymentMethods,
  onSuccess,
}: UseRegisterDonationProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [kid, setKid] = useState<string | null>(null);
  // Our backend's tRPC, or the Danish REST backend (site from the main layout's MainLocaleContext)
  const mainLocale = useMainLocale();
  const flavor = apiFlavorFor(mainLocale);
  const trpc = publicTrpcFor(mainLocale);

  const registerDonation = (formData: FormData) => {
    setLoading(true);

    // Find the selected payment method from the configured payment methods
    const selectedPaymentMethod = paymentMethods.find(
      (method) => method._id === formData.paymentMethod || method._type === formData.paymentMethod,
    );

    // Use the payment method ID from Sanity configuration (_id preferred, fallback to _type, then formData.paymentMethod)
    const paymentMethodId =
      selectedPaymentMethod?._id || selectedPaymentMethod?._type || formData.paymentMethod;

    // Map the payment method ID to PaymentMethod enum using paymentMethodMap
    const selectedMethod = paymentMethodMap[paymentMethodId] || PaymentMethod.BANK;
    const isMonthly = formData.recurring === RecurringDonation.RECURRING;
    // Monthly bank donations in the Norwegian widget are set up as AvtaleGiro
    const method =
      isMonthly && selectedMethod === PaymentMethod.BANK
        ? PaymentMethod.AVTALEGIRO
        : selectedMethod;
    const referralCode = getReferralCodeFromLocation() ?? getStoredReferralCode();

    const donation = {
      distributionCauseAreas: [
        {
          id: organizationInfo.databaseIds.causeAreaId,
          percentageShare: "100",
          standardSplit: false,
          amount: formData.amount,
          organizations: [
            {
              id: organizationInfo.databaseIds.organizationId,
              percentageShare: "100",
              amount: formData.amount,
            },
          ],
        },
      ],
      donor: !formData.email
        ? ANONYMOUS_DONOR
        : {
            name: formData.messageSenderName,
            email: formData.email,
            taxDeduction: formData.taxDeduction,
            ssn: formData.ssn,
            newsletter: formData.newsletter,
          },
      fundraiser: {
        id: fundraiserId,
        message: formData.message,
        messageSenderName: formData.messageSenderName ? formData.messageSenderName : null,
        showName: formData.messageSenderName ? formData.showName : false,
      },
      method: method,
      amount: formData.amount,
      recurring: formData.recurring,
      ...(referralCode ? { referralCode } : {}),
    };

    registerFundraiserDonation(flavor, trpc, donation)
      .then(async (result) => {
        if (!result.ok) {
          console.error("Error:", result.error);
          setLoading(false);
          return;
        }
        const receivedKid = result.content.KID as string;
        const registrationToken = result.content.registrationToken ?? "";
        setKid(receivedKid);
        if (isMonthly && method === PaymentMethod.VIPPS) {
          await draftVippsAgreement(trpc, receivedKid, formData.amount!, registrationToken);
        } else if (method === PaymentMethod.AVTALEGIRO) {
          await draftAvtaleGiro(trpc, receivedKid, formData.amount!, registrationToken);
        } else if (
          result.content.paymentProviderUrl &&
          result.content.paymentProviderUrl.length > 0
        ) {
          window.open(result.content.paymentProviderUrl, "_self");
        } else {
          onSuccess(receivedKid);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        setLoading(false);
      });
  };

  return { registerDonation, loading, kid };
}
