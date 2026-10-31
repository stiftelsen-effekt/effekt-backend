import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import { getAllCauseAreasWithOrganizations } from "../../custom_modules/configService";
import { registerPendingDonation } from "../../custom_modules/pendingDonationRegistration";
import { draftAvtaleGiroAgreement } from "../../custom_modules/avtalegiro";
import { setDraftedAutoGiroPaymentDate } from "../../custom_modules/autogiro";
import { getSwishOrder } from "../../custom_modules/swish";
import { registerDonationSchema } from "../../schemas/publicRequests";
import { registrationFor, verifyRegistrationToken } from "../../custom_modules/registrationToken";
import { sendBankPendingOnce } from "../../custom_modules/bankPendingMail";
import methods from "../../enums/methods";
import { publicProcedure, router } from "../trpc";
import {
  widgetAutoGiroDraftPaymentDateInput,
  widgetBankPendingInput,
  widgetCauseAreasOutput,
  widgetDraftAvtaleGiroInput,
  widgetDraftVippsAgreementInput,
  widgetDraftVippsAgreementOutput,
  widgetSwishOrderStatusInput,
  widgetSwishOrderStatusOutput,
  widgetReferralTypesOutput,
  widgetRegisterDonationOutput,
  widgetSubmitReferralInput,
} from "../shared/widget";

const vipps = require("../../custom_modules/vipps");

/** The "Other" referral type, whose answer carries a free-text comment */
const OTHER_REFERRAL_ID = 10;

/** One answer for a token that is not valid for the KID, whether or not the KID exists */
const invalidRegistration = () =>
  new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired registration" });

/**
 * The public donation widget on the website (no login). Each procedure does what its REST route
 * does, with the same service and DAO calls; the REST routes stay for the Danish site, the
 * fundraiser widget and older clients. Mutations here may not be batched with other calls (see
 * rejectBatchedWidgetMutations in ../express.ts).
 */
export const widgetRouter = router({
  /** GET /causeareas/all */
  causeAreas: publicProcedure
    .output(widgetCauseAreasOutput)
    .query(() => getAllCauseAreasWithOrganizations()),

  /** GET /referrals/types */
  referralTypes: publicProcedure
    .output(widgetReferralTypesOutput)
    .query(() => DAO.referrals.getTypes()),

  /**
   * POST /donations/register: registers a pending donation and, for one-off Vipps and Swish
   * donations, starts the payment. Same validation (registerDonationSchema) and the same code
   * (registerPendingDonation) as the REST route.
   */
  registerDonation: publicProcedure
    .input(registerDonationSchema)
    .output(widgetRegisterDonationOutput)
    .mutation(async ({ input }) => {
      const result = await registerPendingDonation(input);
      if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      return result.content;
    }),

  /**
   * POST /donations/bank/pending: emails the donor how to pay a one-off bank transfer, for a bank
   * donation this client just registered (registrationToken). The email states the amount
   * registered, and goes out once per KID.
   */
  registerBankPending: publicProcedure.input(widgetBankPendingInput).mutation(async ({ input }) => {
    const registration = registrationFor(input.registrationToken, input.KID, [methods.BANK]);
    if (!registration) throw invalidRegistration();

    const success = await sendBankPendingOnce(input.KID, registration.amount);
    if (!success) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not send bank donation pending email",
      });
    }
    return true;
  }),

  /**
   * POST /referrals: records (active) or removes (not active) the donor's answer to "how did you
   * hear about us" for this widget session, for the donor of the registration (registrationToken).
   * An existing answer only has its comment updated, and only for "Other". A donor who answered
   * in an earlier session isn't asked to be counted twice: the new answer is accepted and not
   * stored (the widget can't tell, since registerDonation no longer says who answered before).
   */
  submitReferral: publicProcedure.input(widgetSubmitReferralInput).mutation(async ({ input }) => {
    const registration = verifyRegistrationToken(input.registrationToken);
    if (!registration) throw invalidRegistration();
    const donorID = registration.donorId;
    const { referralID, session } = input;
    const comment = input.comment ?? null;

    if (!input.active) {
      if (!(await DAO.referrals.deleteRecord(referralID, donorID, session))) {
        throw new Error("Failure to delete record");
      }
      return true;
    }

    if (await DAO.referrals.checkRecordExist(referralID, donorID, session)) {
      if (referralID === OTHER_REFERRAL_ID) {
        if (!(await DAO.referrals.updateRecordComment(referralID, donorID, session, comment))) {
          throw new Error("Failed to update existing referral record with new comment.");
        }
      }
      return true;
    }

    if (await DAO.referrals.hasAnsweredInOtherSession(donorID, session)) return true;

    if (!(await DAO.referrals.addRecord(referralID, donorID, session, comment))) {
      throw new Error("Failed to add record");
    }
    return true;
  }),

  /**
   * POST /vipps/agreement/draft: drafts a monthly Vipps agreement for a KID from registerDonation
   * and returns the Vipps page where the donor confirms it. Same call (vipps.draftAgreement) as
   * REST, which also caps the charge day at 28.
   */
  draftVippsAgreement: publicProcedure
    .input(widgetDraftVippsAgreementInput)
    .output(widgetDraftVippsAgreementOutput)
    .mutation(async ({ input }) => {
      if (!registrationFor(input.registrationToken, input.KID, [methods.VIPPS])) {
        throw invalidRegistration();
      }
      const monthlyChargeDay = Math.min(input.monthlyChargeDay, 28);
      const draft = await vipps.draftAgreement(
        input.KID,
        input.amount,
        input.initialCharge,
        monthlyChargeDay,
      );
      // REST answers 200 with `content: false` here, which the widget can't use either
      if (!draft) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not draft the Vipps agreement",
        });
      }
      return draft;
    }),

  /**
   * POST /avtalegiro/draft: drafts an AvtaleGiro agreement for a KID from registerDonation, before
   * the widget hands the donor over to Nets to sign it. The amount is in NOK. Only for a KID this
   * client registered for AvtaleGiro (registrationToken) that has no agreement yet.
   */
  draftAvtaleGiro: publicProcedure.input(widgetDraftAvtaleGiroInput).mutation(async ({ input }) => {
    const result = await draftAvtaleGiroAgreement(
      input.KID,
      input.amount,
      input.dueDay ?? 0,
      input.registrationToken,
    );
    if (!result.ok) {
      if (result.status === 403) throw invalidRegistration();
      throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
    }
    return true;
  }),

  /** GET /swish/orders/:id/status: the widget polls this while the donor pays in Swish */
  swishOrderStatus: publicProcedure
    .input(widgetSwishOrderStatusInput)
    .output(widgetSwishOrderStatusOutput)
    .query(async ({ input }) => {
      const order = await getSwishOrder(Number(input.orderId));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Swish order not found" });
      return { status: order.status };
    }),

  /** PUT /autogiro/:KID/drafted/paymentdate: the payment date of a not yet signed AutoGiro agreement */
  setAutoGiroDraftPaymentDate: publicProcedure
    .input(widgetAutoGiroDraftPaymentDateInput)
    .mutation(async ({ input }) => {
      if (!registrationFor(input.registrationToken, input.KID, [methods.AUTOGIRO])) {
        throw invalidRegistration();
      }
      const result = await setDraftedAutoGiroPaymentDate(input.KID, input.paymentDate);
      if (!result.ok) {
        throw new TRPCError({
          code: result.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
          message: result.message,
        });
      }
      return true;
    }),
});
