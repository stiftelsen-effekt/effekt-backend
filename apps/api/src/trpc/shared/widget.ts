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
  donorID: z.number().int().nullish(),
  hasAnsweredReferral: z.boolean(),
  paymentProviderUrl: z.string().nullish(),
  swishOrderID: z.string().nullish(),
  swishPaymentRequestToken: z.string().nullish(),
});

/** A positive database id (INT) */
const dbId = z.number().int().positive().max(2147483647);

/** widget.submitReferral input (REST POST /referrals) */
export const widgetSubmitReferralInput = z.object({
  referralID: dbId,
  donorID: dbId,
  active: z.boolean(),
  /** The widget's session id (Referral_records.website_session is VARCHAR(45)) */
  session: z.string().min(1).max(45),
  comment: z.string().max(1000).nullish(),
});

/** widget.registerBankPending input (REST POST /donations/bank/pending `data`) */
export const widgetBankPendingInput = z.object({
  KID: z.string().regex(/^\d{1,32}$/),
  sum: z.number().finite(),
});
