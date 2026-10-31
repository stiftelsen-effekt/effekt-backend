import { z } from "zod";

/**
 * Output schemas for the public donation widget procedures (widget.*), shared with apps/web
 * through `@effekt/api/widget`. On the Danish site the REST link validates the Danish backend's
 * responses with these too, so they accept what both backends send (the Danish one answers
 * `null` for most descriptions and leaves out `abbreviation`). This file may only import zod.
 */

const text = z.string().nullish();
const smallInt = z.number().nullish();

export const widgetOrganization = z.object({
  id: z.number().int(),
  causeAreaId: z.number().int(),
  name: z.string(),
  widgetDisplayName: text,
  widgetContext: text,
  abbreviation: text,
  shortDescription: text,
  longDescription: text,
  informationUrl: text,
  standardShare: smallInt,
  isActive: z.boolean(),
  ordering: smallInt,
});

export const widgetCauseArea = z.object({
  id: z.number().int(),
  name: z.string(),
  widgetDisplayName: text,
  widgetContext: text,
  shortDescription: text,
  longDescription: text,
  informationUrl: text,
  standardPercentageShare: smallInt,
  isActive: z.boolean(),
  ordering: smallInt,
  organizations: z.array(widgetOrganization),
});

/** widget.causeAreas: every cause area with its organizations (REST GET /causeareas/all) */
export const widgetCauseAreasOutput = z.array(widgetCauseArea);

/** widget.referralTypes: the active "how did you hear about us" options (REST GET /referrals/types) */
export const widgetReferralTypesOutput = z.array(
  z.object({
    id: z.number().int(),
    name: z.string(),
    ordering: z.number().nullable(),
  }),
);

/**
 * widget.registerDonation (REST POST /donations/register `content`). This is checked after the
 * donation is registered and the payment started, so it is lenient (nullish) on purpose: a value
 * the widget can live without must never turn a registered donation into an error.
 */
export const widgetRegisterDonationOutput = z.object({
  KID: z.string().nullish(),
  hasAnsweredReferral: z.boolean(),
  /** Sent back with the follow-up calls below; the Danish backend has none */
  registrationToken: z.string().nullish(),
  paymentProviderUrl: z.string().nullish(),
});

/** A positive database id (INT) */
const dbId = z.number().int().positive().max(2147483647);

/**
 * The registrationToken from widget.registerDonation. The calls that act on a registered KID or
 * donor take it, and only act on the KID and donor it was issued for, for a couple of hours.
 */
const registrationToken = z.string().min(1).max(2048);

/** The largest amount (NOK or SEK) the widget's follow-up calls accept */
export const WIDGET_MAX_AMOUNT = 10_000_000;

/** A positive amount with at most two decimals (whole øre), as the widget's breakdown gives it */
const widgetAmount = z
  .number()
  .finite()
  .positive()
  .max(WIDGET_MAX_AMOUNT)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "At most two decimals");

/** widget.submitReferral input (REST POST /referrals) */
export const widgetSubmitReferralInput = z.object({
  referralID: dbId,
  registrationToken,
  active: z.boolean(),
  /** The widget's session id (Referral_records.website_session is VARCHAR(45)) */
  session: z.string().min(1).max(45),
  comment: z.string().max(1000).nullish(),
});

/** widget.registerBankPending input (REST POST /donations/bank/pending `data`) */
export const widgetBankPendingInput = z.object({
  KID: z.string().regex(/^\d{1,32}$/),
  /** The email states the amount registered with the KID; this is only checked */
  sum: widgetAmount,
  registrationToken,
});

/** A KID as the widget gets it from registerDonation: a string of digits */
const kid = z.string().regex(/^\d{1,32}$/);

/** A monthly amount in NOK, as the widget's donation breakdown gives it */
const nokAmount = widgetAmount;

/**
 * widget.draftVippsAgreement input (REST POST /vipps/agreement/draft). The REST route takes any
 * body; this takes what the widgets send. A charge day above 28 is treated as 28, like REST.
 */
export const widgetDraftVippsAgreementInput = z.strictObject({
  KID: kid,
  amount: nokAmount,
  initialCharge: z.boolean(),
  monthlyChargeDay: z.number().int().min(0).max(31),
  registrationToken,
});

/** widget.draftVippsAgreement: where to send the donor to confirm the agreement in Vipps */
export const widgetDraftVippsAgreementOutput = z.object({
  vippsConfirmationUrl: z.string().url(),
});

/**
 * widget.draftAvtaleGiro input (REST POST /avtalegiro/draft). dueDay is the day of the month
 * (0 = last day); REST turns a missing or invalid one into 0, this only accepts a missing one.
 */
export const widgetDraftAvtaleGiroInput = z.strictObject({
  KID: kid,
  amount: nokAmount,
  dueDay: z.number().int().min(0).max(28).optional(),
  registrationToken,
});
