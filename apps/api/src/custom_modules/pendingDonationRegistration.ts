import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";
import { sendAutoGiroRegistered } from "./mail";
import * as swish from "./swish";
import methods from "../enums/methods";
import { Distribution, DistributionInput } from "../schemas/types";
import { MAX_REFERRAL_CODE_LENGTH, normalizeReferralCode } from "./referralCode";
import type { RegisterDonationBody } from "../schemas/publicRequests";
import { idnr } from "@navikt/fnrvalidator";
import { isValidNorwegianOrgNr } from "./donorService";
import { isValidPersonnummer } from "./ku65/ku65_lib";
import { createRegistrationToken } from "./registrationToken";

const vipps = require("./vipps");

export type PendingDonationRegistered = {
  KID: string | null;
  /**
   * Always false: whether a donor has answered before would tell anyone who knows an email
   * address that it belongs to a donor. submitReferral ignores repeat answers instead.
   */
  hasAnsweredReferral: boolean;
  /** Lets the widget's follow-up calls act on this registration (see registrationToken.ts) */
  registrationToken: string | null;
  paymentProviderUrl: string;
  swishOrderID: string | null;
  swishPaymentRequestToken: string | null;
};

export type PendingDonationResult =
  { ok: true; content: PendingDonationRegistered } | { ok: false; message: string };

const rejected = (message: string): PendingDonationResult => ({ ok: false, message });

/**
 * A donor created this long ago or less may still get a tax unit from the widget: the donor who
 * goes back in the widget to add their ssn after a first registration
 */
const FRESH_DONOR_MS = 30 * 60 * 1000;

/**
 * Whether the widget may register this ssn: what the widgets accept, a Norwegian fødselsnummer,
 * D- or H-number (11 digits) or organisasjonsnummer (9 digits), or a Swedish personnummer or
 * organisationsnummer (10 or 12 digits, optionally with - or + before the last four)
 */
function isValidWidgetSsn(ssn: string): boolean {
  if (/^\d{9}$/.test(ssn)) return isValidNorwegianOrgNr(ssn);
  if (/^\d{11}$/.test(ssn)) return idnr(ssn).status === "valid";
  if (/^(\d{6}|\d{8})[-+]?\d{4}$/.test(ssn)) return isValidPersonnummer(ssn);
  return false;
}

/**
 * Registers a pending donation from the donation widget or the fundraiser widget: finds or
 * creates the donor (and tax unit), finds or creates the KID and distribution, starts the Vipps
 * or Swish payment for one-off donations, and records the payment intent and referral code.
 * Shared by REST POST /donations/register and the tRPC widget.registerDonation, so both do
 * exactly the same thing. The body must already be parsed with registerDonationSchema.
 *
 * Returns `ok: false` for requests the API rejects (400); database and payment provider errors
 * are thrown.
 */
export async function registerPendingDonation(
  parsedData: RegisterDonationBody,
): Promise<PendingDonationResult> {
  if (parsedData.method === methods.SWISH) {
    if (parsedData.recurring) return rejected("Recurring donations not supported with Swish");
  }

  if (parsedData.referralCode != null && parsedData.referralCode !== "") {
    if (typeof parsedData.referralCode !== "string") {
      return rejected("Invalid referral code");
    }
    if (parsedData.referralCode.trim().length > MAX_REFERRAL_CODE_LENGTH) {
      return rejected("Referral code is too long");
    }
  }

  let donor = parsedData.donor;
  if (donor.ssn != null && donor.ssn !== "") {
    donor = { ...donor, ssn: donor.ssn.trim() };
    if (!isValidWidgetSsn(donor.ssn!)) return rejected("Invalid ssn");
  }
  let paymentProviderUrl = "";
  let swishOrderID: string | null = null;
  let swishPaymentRequestToken: string | null = null;
  let recurring = parsedData.recurring;
  const fundraiser = parsedData.fundraiser;

  const donationObject: Pick<typeof parsedData, "amount" | "method" | "recurring"> & {
    KID: string | null;
    donorID: number | null;
    taxUnitId: number | null;
    fundraiserTransactionId: number | null;
  } = {
    amount: parsedData.amount,
    method: parsedData.method,
    recurring: parsedData.recurring,
    KID: null, //Set later in code
    donorID: null, //Set later in code
    taxUnitId: null, //Set later in code
    fundraiserTransactionId: null,
  };

  //Check if existing donor
  donationObject.donorID = await DAO.donors.getIDbyEmail(donor.email);

  if (donationObject.donorID == null) {
    //Donor does not exist, create donor
    donationObject.donorID = await DAO.donors.add({
      email: donor.email,
      full_name: donor.name,
      newsletter: donor.newsletter,
    });
    if (donor.ssn != null && donor.ssn !== "") {
      donationObject.taxUnitId = await DAO.tax.addTaxUnit(
        donationObject.donorID,
        donor.ssn,
        donor.name ?? "",
      );
    } else {
      donationObject.taxUnitId = null;
    }
  } else {
    /*
     * An existing donor. Anyone can type any email address into the widget, so this request
     * must not change the donor: their name, newsletter choice and tax units stay as they are.
     * A donation for an ssn the donor already has a tax unit for is registered on that unit;
     * a new ssn only gets a tax unit for a donor created moments ago (the same donor going back
     * in the widget to add it). Otherwise the donation is registered without a tax unit, and the
     * donor can add the unit in Min Side.
     */
    if (donor.ssn != null && donor.ssn !== "") {
      const existingTaxUnit = await DAO.tax.getByDonorIdAndSsn(donationObject.donorID, donor.ssn);

      if (existingTaxUnit) {
        donationObject.taxUnitId = existingTaxUnit.id;
      } else {
        const dbDonor = await DAO.donors.getByID(donationObject.donorID);
        const registered = dbDonor?.registered ? new Date(dbDonor.registered).getTime() : NaN;
        if (Date.now() - registered <= FRESH_DONOR_MS) {
          donationObject.taxUnitId = await DAO.tax.addTaxUnit(
            donationObject.donorID,
            donor.ssn,
            donor.name ?? "",
          );
        }
      }
    }
  }

  /* Construct distribution object */
  const draftDistribution: DistributionInput = {
    donorId: donationObject.donorID,
    taxUnitId: donationObject.taxUnitId,
    causeAreas: parsedData.distributionCauseAreas,
  };

  /* Get the standard shares of the organizations for all cause areas with standard split */
  for (const causeArea of draftDistribution.causeAreas) {
    if (causeArea.standardSplit) {
      const standardShareOrganizations =
        await DAO.distributions.getStandardDistributionByCauseAreaID(causeArea.id);
      causeArea.organizations = standardShareOrganizations;
    } else {
      causeArea.organizations = causeArea.organizations.filter(
        (o) => parseFloat(o.percentageShare) > 0,
      );
    }
  }

  /** Use new KID for avtalegiro */
  if (donationObject.method == methods.AVTALEGIRO) {
    if (fundraiser) {
      // Every charge on the agreement uses this KID, so they all count towards the fundraiser
      donationObject.fundraiserTransactionId = await DAO.fundraisers.addFundraiserTransaction({
        fundraiserId: fundraiser.id,
        message: fundraiser.message ?? null,
        messageSenderName: fundraiser.messageSenderName ?? null,
        showName: fundraiser.showName,
      });
    }

    //Create unique KID for each AvtaleGiro to prevent duplicates causing conflicts
    donationObject.KID = await donationHelpers.createAvtaleGiroKID();
    await DAO.distributions.add({
      ...draftDistribution,
      kid: donationObject.KID,
      fundraiserTransactionId: donationObject.fundraiserTransactionId ?? null,
    });
  } else if (donationObject.method == methods.AUTOGIRO) {
    if (fundraiser) {
      return rejected("Fundraisers are not supported with AutoGiro");
    }

    donationObject.KID = await donationHelpers.createKID(8);
    await DAO.distributions.add({
      ...draftDistribution,
      kid: donationObject.KID,
    });

    // Draft AutoGiro
    await DAO.autogiroagreements.draftAgreement({
      KID: donationObject.KID,
      amount:
        typeof donationObject.amount === "string"
          ? parseFloat(donationObject.amount)
          : donationObject.amount,
      payment_date: 27,
    });

    try {
      await sendAutoGiroRegistered(donationObject.KID, donor.email);
    } catch (ex) {
      console.error(`Failed to send AutoGiro registered email for KID ${donationObject.KID}`);
    }
  } else {
    //Try to get existing KID if not a fundraiser
    // For fundraisers, we always create a new KID to store the message and fundraiser ID
    if (!fundraiser) {
      donationObject.KID = await DAO.distributions.getKIDbySplit(
        {
          donorId: donationObject.donorID,
          taxUnitId: donationObject.taxUnitId,
          causeAreas: draftDistribution.causeAreas,
        },
        0,
        8,
      );
    }

    //Split does not exist create new KID and split
    if (donationObject.KID == null) {
      if (fundraiser) {
        // Add a fundraiser transaction ID to store the fundraiser ID and message
        donationObject.fundraiserTransactionId = await DAO.fundraisers.addFundraiserTransaction({
          fundraiserId: fundraiser.id,
          message: fundraiser.message ?? null,
          messageSenderName: fundraiser.messageSenderName ?? null,
          showName: fundraiser.showName,
        });
      }

      donationObject.KID = await donationHelpers.createKID();

      let distribution: Distribution = {
        kid: donationObject.KID,
        fundraiserTransactionId: donationObject.fundraiserTransactionId ?? null,
        ...draftDistribution,
      };

      await DAO.distributions.add(distribution);
    }
  }

  switch (donationObject.method) {
    case methods.VIPPS: {
      if (recurring == false) {
        const res = await vipps.initiateOrder(donationObject.KID, donationObject.amount);
        paymentProviderUrl = res.externalPaymentUrl;

        //Start polling for updates (move this to inside initiateOrder?)
        vipps.pollOrder(res.orderId);
      }
      break;
    }
    case methods.SWISH: {
      if (recurring == false) {
        const res = await swish.initiateOrder(donationObject.KID, {
          amount:
            typeof donationObject.amount === "string"
              ? parseInt(donationObject.amount)
              : donationObject.amount,
        });
        swishOrderID = res.orderID;
        swishPaymentRequestToken = res.paymentRequestToken;
      }
      break;
    }
  }

  try {
    await DAO.initialpaymentmethod.addPaymentIntent(
      donationObject.amount,
      donationObject.method,
      donationObject.KID,
    );
  } catch (error) {
    console.error(error);
  }

  const referralCode = normalizeReferralCode(parsedData.referralCode);
  if (referralCode && donationObject.KID) {
    try {
      await DAO.donationReferralCodes.add(donationObject.KID, referralCode);
    } catch (error) {
      console.error("Failed to store referral code for KID %s:", donationObject.KID, error);
    }
  }

  const registrationToken = donationObject.KID
    ? createRegistrationToken({
        kid: donationObject.KID,
        method: donationObject.method,
        donorId: donationObject.donorID,
        amount: Number(donationObject.amount),
      })
    : null;

  return {
    ok: true,
    content: {
      KID: donationObject.KID,
      hasAnsweredReferral: false,
      registrationToken,
      paymentProviderUrl,
      swishOrderID,
      swishPaymentRequestToken,
    },
  };
}
