import { RecurringDonation } from "../types/Enums";

interface PaymentMethodConfiguration {
  id:
    | "bank"
    | "vipps"
    | "swish"
    | "autogiro"
    | "avtalegiro"
    | "quickpay_card"
    | "quickpay_mobilepay"
    | "dkbank";
  recurringOptions: RecurringDonation[];
  openExternalPaymentOnRegisterSuccess?: boolean;
}

const bankConfiguration: PaymentMethodConfiguration = {
  id: "bank",
  recurringOptions: [RecurringDonation.NON_RECURRING],
};

const vippsConfiguration: PaymentMethodConfiguration = {
  id: "vipps",
  recurringOptions: [RecurringDonation.RECURRING, RecurringDonation.NON_RECURRING],
};

const swishConfiguration: PaymentMethodConfiguration = {
  id: "swish",
  recurringOptions: [RecurringDonation.NON_RECURRING],
};

const autogiroConfiguration: PaymentMethodConfiguration = {
  id: "autogiro",
  recurringOptions: [RecurringDonation.RECURRING],
};

const avtalegiroConfiguration: PaymentMethodConfiguration = {
  id: "avtalegiro",
  recurringOptions: [RecurringDonation.RECURRING],
};

const quickpayCardConfiguration: PaymentMethodConfiguration = {
  id: "quickpay_card",
  recurringOptions: [RecurringDonation.RECURRING, RecurringDonation.NON_RECURRING],
  openExternalPaymentOnRegisterSuccess: true,
};

const quickpayMobilePayConfiguration: PaymentMethodConfiguration = {
  id: "quickpay_mobilepay",
  recurringOptions: [RecurringDonation.RECURRING, RecurringDonation.NON_RECURRING],
  openExternalPaymentOnRegisterSuccess: true,
};

const dkbankConfiguration: PaymentMethodConfiguration = {
  id: "dkbank",
  recurringOptions: [RecurringDonation.RECURRING],
  openExternalPaymentOnRegisterSuccess: true,
};

export const paymentMethodConfigurations = [
  bankConfiguration,
  vippsConfiguration,
  swishConfiguration,
  autogiroConfiguration,
  avtalegiroConfiguration,
  quickpayCardConfiguration,
  quickpayMobilePayConfiguration,
  dkbankConfiguration,
];
