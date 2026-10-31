import { ANONYMOUS_DONOR } from "../../../config/anonymous-donor";
import { DonorInfo } from "../../../store/actions";
import { Donation, DonorFormDraft } from "../../../store/state";

/** The donor pane's fields and what the donor entered in them */
export type DonorFormValues = DonorFormDraft;

export type DonorFormField = "name" | "email" | "ssn" | "privacyPolicy";
export type DonorFormErrors = Partial<Record<DonorFormField, true>>;

/**
 * Where the form starts: what the donor entered last time (the carousel unmounts the pane when
 * they navigate away), or else the registered donor (from going back after registering) or the
 * signed-in donor's name and email.
 */
export const initialDonorFormValues = (
  donation: Donation,
  signedInDonor?: { name?: string | null; email?: string | null } | null,
): DonorFormValues => {
  if (donation.donorFormDraft) return donation.donorFormDraft;
  const { donor } = donation;
  return {
    isAnonymous: donor?.email === ANONYMOUS_DONOR.email,
    name: donor.name === ANONYMOUS_DONOR.name ? "" : signedInDonor?.name || donor.name || "",
    email: donor.email === ANONYMOUS_DONOR.email ? "" : signedInDonor?.email || donor.email || "",
    ssn: donor.ssn === ANONYMOUS_DONOR.ssn ? "" : donor.ssn || "",
    taxDeduction: donor.taxDeduction,
    newsletter: donor.newsletter,
    // Not shown in the form: kept as it was in the draft
    method: donation.method!,
    privacyPolicy: false,
    referralCode: donation.referralCode || "",
  };
};

export type DonorFormRules = {
  /** The name field is shown (Sanity show_name_field) */
  nameField: boolean;
  /** The privacy policy checkbox is shown and must be checked */
  privacyPolicyCheckbox: boolean;
  /** The site's national id check; true when the donor is anonymous or wants no tax deduction */
  validSsn: (ssn: string, isAnonymous: boolean) => boolean;
};

/**
 * The fields that keep the donor from paying. Checked when they choose a payment method; the
 * messages then stay until they try again, or until they make the field irrelevant (going
 * anonymous, turning on the tax deduction afresh).
 */
export const validateDonorForm = (
  values: DonorFormValues,
  rules: DonorFormRules,
): DonorFormErrors => {
  const errors: DonorFormErrors = {};
  if (rules.nameField && !values.isAnonymous && values.name.trim().length <= 3) {
    errors.name = true;
  }
  if (!values.isAnonymous && !/@/.test(values.email.trim())) errors.email = true;
  if (!rules.validSsn(values.ssn.toString(), values.isAnonymous)) errors.ssn = true;
  // Required whether or not the donor is anonymous
  if (rules.privacyPolicyCheckbox && !values.privacyPolicy) errors.privacyPolicy = true;
  return errors;
};

// Capitalizes the first letter of every first, middle and last name
const capitalizeNames = (name: string) =>
  name.replace(/(^\w|\s\w)/g, (m: string) => m.toUpperCase());

/** The donor as registered */
export const donorFromForm = (values: DonorFormValues, nameField: boolean): DonorInfo =>
  values.isAnonymous
    ? ANONYMOUS_DONOR
    : {
        name: nameField ? capitalizeNames(values.name.trim()) : "",
        email: values.email.trim().toLowerCase(),
        taxDeduction: values.taxDeduction,
        ssn: values.taxDeduction ? values.ssn.toString().trim() : "",
        newsletter: values.newsletter,
      };
