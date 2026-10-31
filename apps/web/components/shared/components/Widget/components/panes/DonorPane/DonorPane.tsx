import { usePlausible } from "next-plausible";
import Link from "next/link";
import React, { useContext } from "react";
import { useDonationTotal, useWidgetSelector, useWidgetStore } from "../../../store/store";
import { registerDonation } from "../../../store/flows";
import { DonorContext } from "../../../../../../profile/layout/donorContext";
import {
  selectPaymentMethod,
  submitDonorInfo,
  setReferralCode,
  setDonorFormDraft,
} from "../../../store/actions";
import { State } from "../../../store/state";
import {
  DonorFormErrors,
  DonorFormField,
  DonorFormValues,
  donorFromForm,
  initialDonorFormValues,
  validateDonorForm,
} from "./donorForm";
import { PaymentMethod } from "../../../types/Enums";
import { WidgetPane2Props, WidgetProps } from "../../../types/WidgetProps";
import { ErrorField } from "../../shared/Error/ErrorField";
import { ToolTip } from "../../shared/ToolTip/ToolTip";
import { CustomCheckBox } from "./CustomCheckBox";
import { getEstimatedLtv } from "../../../../../../../util/ltv";
import { widgetTrpc } from "../../../store/widgetApi";
import AnimateHeight from "react-animate-height";
import { DonationSummary, DonationSummaryText } from "../../shared/DonationSummary/DonationSummary";
import { NextButton } from "../../shared/Buttons/NavigationButtons";
import { paymentMethodConfigurations } from "../../../config/methods";
import { useSsnValidation } from "./useSsnValidation";
import { RadioButtonGroup } from "../../../../RadioButton/RadioButtonGroup";
import { currencyForLocale } from "../../../utils/currency";
import panes from "../Panes.module.scss";
import forms from "../Forms.module.scss";
import styles from "./DonorPane.module.scss";
import navigationButtons from "../../shared/Buttons/NavigationButtons.module.scss";
import summary from "../../shared/DonationSummary/DonationSummary.module.scss";
import { Spinner } from "../../../../Spinner/Spinner";

export const DonorPane: React.FC<{
  locale: "en" | "no" | "sv" | "et" | "dk";
  text: WidgetPane2Props;
  summaryText: DonationSummaryText;
  paymentMethods: NonNullable<WidgetProps["methods"]>;
  isSingleCauseArea?: boolean;
}> = ({ locale, text, summaryText, paymentMethods, isSingleCauseArea = false }) => {
  const store = useWidgetStore();
  const { dispatch } = store;
  const donation = useWidgetSelector((state: State) => state.donation);
  const { donor: initialDonor } = useContext(DonorContext);

  const totalSumIncludingTip = useDonationTotal();

  // The carousel unmounts this pane when the donor navigates away: start from what they
  // entered last time, and keep it in the store when the pane goes
  const [values, setValues] = React.useState(() => initialDonorFormValues(donation, initialDonor));
  const [errors, setErrors] = React.useState<DonorFormErrors>({});
  const setValue = <K extends keyof DonorFormValues>(field: K, value: DonorFormValues[K]) =>
    setValues((current) => ({ ...current, [field]: value }));
  const clearErrors = (fields: DonorFormField[]) =>
    setErrors((current) => {
      const next = { ...current };
      fields.forEach((field) => delete next[field]);
      return next;
    });

  const latestValues = React.useRef(values);
  React.useEffect(() => {
    latestValues.current = values;
  }, [values]);
  React.useEffect(() => () => dispatch(setDonorFormDraft(latestValues.current)), [dispatch]);

  const plausible = usePlausible();

  const { taxDeduction: taxDeductionChecked, newsletter: newsletterChecked, isAnonymous } = values;
  const [loadingMethod, setLoadingMethod] = React.useState<string | null>(null);
  // Set synchronously on the first click, before validation awaits, so a double click (or a
  // click on a second payment method) can't register the donation twice
  const submittingRef = React.useRef(false);
  // For the single-cause-area flow, payment method selection is a distinct
  // step from submission (matches the pre-rewrite behavior) - the radio
  // just records a choice, and a separate Next button submits it.
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = React.useState<string | null>(null);

  // If registration fails, clear the loading state so the button shows its
  // label again instead of being stuck showing a spinner indefinitely.
  // apiError can be null (rather than just absent/undefined) to signal a
  // generic error message, so check for that explicitly rather than
  // truthiness - a falsy-but-set apiError must still trigger the reset.
  React.useEffect(() => {
    if (typeof donation.apiError !== "undefined") {
      submittingRef.current = false;
      // oxlint-disable-next-line react/set-state-in-effect -- follows the registration's outcome in the store, and resets the ref too
      setLoadingMethod(null);
    }
  }, [donation.apiError]);

  // Coming back from an external payment page restores this page from the back/forward cache
  // as it was when the donor left - with the payment button still spinning - so let them pay again
  React.useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        submittingRef.current = false;
        setLoadingMethod(null);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Locale-aware SSN/CPR validation (handles NO, SE and DK CPR/CVR incl. suspicious CPR warning)
  const { validateSsn, formatSsnInput, cprSuspicious } = useSsnValidation({
    locale,
    taxDeductionChecked,
  });

  // Query-param referral codes are applied after cause areas load, which can be
  // after this form's first render — keep the input in sync when the store updates.
  // A restored draft already holds the donor's own referral code, so do not overwrite it
  const [hasSyncedReferralCode, setHasSyncedReferralCode] = React.useState(
    donation.donorFormDraft !== undefined,
  );
  if (donation.referralCode && !hasSyncedReferralCode) {
    setHasSyncedReferralCode(true);
    setValue("referralCode", donation.referralCode);
  }

  const mapPaymentMethod = (method: string): PaymentMethod => {
    const mapped = paymentMethodMap[method];
    if (!mapped) throw new Error(`Unknown payment method: ${method}`);
    return mapped;
  };

  const handlePayment = (methodId: string) => {
    // Validation runs here only, when the donor picks a payment method, and is the only thing
    // that keeps them from paying: the payment buttons are never disabled because of it.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const validationErrors = validateDonorForm(values, {
      nameField: !!text.show_name_field,
      privacyPolicyCheckbox: !!text.privacy_policy_link && !!text.require_privacy_policy_checkbox,
      validSsn: validateSsn,
    });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      submittingRef.current = false;
      return;
    }

    setLoadingMethod(methodId);
    const paymentMethod = mapPaymentMethod(methodId);

    const formData = values;

    // Submit donor info and payment method
    if (!formData.isAnonymous) {
      plausible("SubmitDonorPane", {
        props: {
          donorType: formData.isAnonymous ? 0 : 1,
          taxDeduction: formData.taxDeduction,
          newsletter: formData.newsletter,
          method: paymentMethod,
        },
      });

      if (donation.recurring) {
        if (paymentMethod === PaymentMethod.VIPPS) plausible("SelectVippsRecurring");
        if (paymentMethod === PaymentMethod.AVTALEGIRO) plausible("SelectAvtaleGiro");

        if (totalSumIncludingTip) {
          if (
            // @ts-ignore
            typeof window !== "undefined" &&
            // @ts-ignore
            typeof window.fbq !== "undefined" &&
            // @ts-ignore
            window.fbq != null
          ) {
            getEstimatedLtv({
              method: paymentMethod,
              sum: totalSumIncludingTip,
              trpc: widgetTrpc(),
            }).then((ltv) => {
              // @ts-ignore
              window.fbq("track", "Lead", {
                value: ltv,
                currency: currencyForLocale(locale),
              });
            });
          }
        }
      }
      if (!donation.recurring) {
        if (paymentMethod === PaymentMethod.VIPPS) plausible("SelectSingleVippsPayment");
        if (paymentMethod === PaymentMethod.BANK) {
          plausible("SelectBankSingle");
        }
        // Facebook pixel tracking for Leads
        if (typeof window !== "undefined") {
          // @ts-ignore
          if (window.fbq != null) {
            // @ts-ignore
            window.fbq("track", "Lead", {
              value: totalSumIncludingTip,
              currency: currencyForLocale(locale),
            });
          }
        }
      }
    }

    dispatch(submitDonorInfo(donorFromForm(formData, !!text.show_name_field)));

    if (text.show_referral_code_field) {
      dispatch(setReferralCode(formData.referralCode));
    }

    dispatch(selectPaymentMethod(paymentMethod));

    // For external payment providers (e.g. Quickpay/MobilePay/DK bank), registerDonation opens the
    // provider URL directly on a successful registration.
    const configuration = paymentMethodConfigurations.find((config) => config.id === methodId);
    void registerDonation(store, {
      openExternalPaymentOnRegisterSuccess: configuration?.openExternalPaymentOnRegisterSuccess,
    });
  };

  return (
    <div className={panes.pane}>
      <form className={styles.donorForm} autoComplete="on">
        <div className={panes.paneContainer}>
          <div>
            {isSingleCauseArea ? (
              <h2 className={panes.paneTitle}>
                <wbr />
              </h2>
            ) : (
              <DonationSummary text={summaryText} />
            )}

            {text.allow_anonymous_donations && (
              <div style={{ marginBottom: "20px" }}>
                <div className={forms.checkBoxWrapper} data-cy="anon-button-div">
                  <input
                    className={forms.hiddenCheckBox}
                    data-cy="anon-checkbox"
                    type="checkbox"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                      }
                    }}
                    name="isAnonymous"
                    checked={isAnonymous}
                    onChange={(e) => {
                      setValue("isAnonymous", e.target.checked);
                      clearErrors(["name", "email", "ssn"]);
                      (document.activeElement as HTMLElement).blur();
                    }}
                  />
                  <CustomCheckBox label={text.anon_button_text} checked={isAnonymous} />
                  <ToolTip text={text.anon_button_text_tooltip} />
                </div>
              </div>
            )}

            <AnimateHeight height={isAnonymous ? 0 : "auto"} animateOpacity>
              {text.show_name_field && (
                <div className={forms.inputFieldWrapper}>
                  <input
                    data-cy="name-input"
                    type="text"
                    placeholder={text.name_placeholder}
                    name="name"
                    value={values.name}
                    onChange={(e) => setValue("name", e.target.value)}
                  />
                  {errors.name && <ErrorField text={text.name_invalid_error_text} />}
                </div>
              )}
              <div className={forms.inputFieldWrapper}>
                <input
                  data-cy="email-input"
                  type="email"
                  placeholder={text.email_placeholder}
                  name="email"
                  value={values.email}
                  onChange={(e) => setValue("email", e.target.value)}
                />
                {errors.email && <ErrorField text={text.email_invalid_error_text} />}
              </div>
              {text.show_referral_code_field && (
                <div className={forms.inputFieldWrapper}>
                  <input
                    data-cy="referral-code-input"
                    type="text"
                    autoComplete="off"
                    placeholder={text.referral_code_placeholder}
                    name="referralCode"
                    value={values.referralCode}
                    onChange={(e) => setValue("referralCode", e.target.value)}
                  />
                </div>
              )}
              <div className={styles.checkBoxGroupWrapper}>
                <div>
                  <div className={forms.checkBoxWrapper}>
                    <input
                      className={forms.hiddenCheckBox}
                      data-cy="tax-deduction-checkbox"
                      type="checkbox"
                      onKeyDown={(e) => {
                        if (!taxDeductionChecked) clearErrors(["ssn"]);
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                        }
                      }}
                      name="taxDeduction"
                      checked={taxDeductionChecked}
                      onChange={(e) => {
                        setValue("taxDeduction", e.target.checked);
                        if (!taxDeductionChecked) clearErrors(["ssn"]);
                        (document.activeElement as HTMLElement).blur();
                      }}
                    />
                    <CustomCheckBox
                      label={text.tax_deduction_selector_text}
                      checked={taxDeductionChecked}
                    />
                    {taxDeductionChecked && <ToolTip text={text.tax_deduction_tooltip_text} />}
                  </div>

                  <AnimateHeight
                    height={taxDeductionChecked ? "auto" : 0}
                    animateOpacity
                    duration={200}
                  >
                    <div className={forms.inputFieldWrapper}>
                      <input
                        data-cy="ssn-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={text.tax_deduction_ssn_placeholder}
                        name="ssn"
                        value={values.ssn}
                        // A Danish CPR/CVR number is kept and sent as shown (010101-1234)
                        onChange={(e) => setValue("ssn", formatSsnInput(e.target.value))}
                      />
                      {errors.ssn && (
                        <ErrorField text={text.tax_deduction_ssn_invalid_error_text} />
                      )}
                      {cprSuspicious && text.tax_deduction_ssn_suspicious_message && (
                        <div className={styles.infoMessageWrapper} data-cy="cpr-suspicious-message">
                          {text.tax_deduction_ssn_suspicious_message}
                        </div>
                      )}
                    </div>
                  </AnimateHeight>
                </div>
                <div className={forms.checkBoxWrapper}>
                  <input
                    className={forms.hiddenCheckBox}
                    data-cy="newsletter-checkbox"
                    type="checkbox"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                      }
                    }}
                    name="newsletter"
                    checked={newsletterChecked}
                    onChange={(e) => {
                      setValue("newsletter", e.target.checked);
                      (document.activeElement as HTMLElement).blur();
                    }}
                  />
                  <CustomCheckBox
                    label={text.newsletter_selector_text}
                    mobileLabel={text.newsletter_selector_text}
                    checked={newsletterChecked}
                  />
                </div>
                {text.privacy_policy_link && (
                  <div style={{ marginTop: "10px" }}>
                    {text.require_privacy_policy_checkbox && (
                      <>
                        <div style={{ display: "flex", flexDirection: "row" }}>
                          <div className={forms.checkBoxWrapper}>
                            <input
                              className={forms.hiddenCheckBox}
                              data-cy="privacy-policy-checkbox"
                              type="checkbox"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                }
                              }}
                              name="privacyPolicy"
                              checked={values.privacyPolicy}
                              onChange={(e) => {
                                setValue("privacyPolicy", e.target.checked);
                                (document.activeElement as HTMLElement).blur();
                              }}
                            />
                            <CustomCheckBox
                              label={text.privacy_policy_text}
                              checked={values.privacyPolicy}
                            />
                          </div>
                          <Link
                            href={`/${text.privacy_policy_link.slug}`}
                            target={"_blank"}
                            onClick={(e) => {
                              e.currentTarget.blur();
                            }}
                            style={{
                              borderBottom: "1px solid var(--primary)",
                              display: "inline-flex",
                              height: "30px",
                              marginTop: "5px",
                              marginLeft: "7px",
                            }}
                          >
                            {`${text.privacy_policy_link.title}  ↗`}
                          </Link>
                        </div>
                        {errors.privacyPolicy && (
                          <ErrorField text={text.privacy_policy_required_error_text} />
                        )}
                      </>
                    )}
                    {!text.require_privacy_policy_checkbox && (
                      <>
                        {text.privacy_policy_text}{" "}
                        <Link
                          href={`/${text.privacy_policy_link.slug}`}
                          target={"_blank"}
                          onClick={(e) => {
                            e.currentTarget.blur();
                          }}
                          style={{ borderBottom: "1px solid var(--primary)" }}
                        >
                          {`${text.privacy_policy_link.title}  ↗`}
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            </AnimateHeight>

            {isSingleCauseArea ? (
              <>
                <RadioButtonGroup
                  options={paymentMethods.map((method) => ({
                    title: method.selector_text,
                    value: paymentMethodMap[method._id],
                    data_cy: `payment-method-${method._id}`,
                  }))}
                  selected={
                    selectedPaymentMethodId ? paymentMethodMap[selectedPaymentMethodId] : undefined
                  }
                  onSelect={(value) => {
                    const method = paymentMethods.find((m) => paymentMethodMap[m._id] === value);
                    if (method) setSelectedPaymentMethodId(method._id);
                  }}
                />
                <div className={styles.actionBar} data-cy="next-button-div">
                  <NextButton
                    type="button"
                    disabled={!selectedPaymentMethodId}
                    onClick={(e) => {
                      e.preventDefault();
                      if (selectedPaymentMethodId) handlePayment(selectedPaymentMethodId);
                    }}
                    data-cy="next-button"
                  >
                    {loadingMethod ? (
                      <Spinner className={navigationButtons.spinner} />
                    ) : (
                      text.pane2_button_text
                    )}
                  </NextButton>
                </div>
              </>
            ) : (
              <div className={summary.paymentButtonsWrapper} style={{ marginTop: "20px" }}>
                {paymentMethods.map((method) => (
                  <button
                    className={summary.paymentButton}
                    key={method._id}
                    aria-busy={loadingMethod === method._id || undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      handlePayment(method._id);
                    }}
                    data-cy={`payment-method-${method._id}`}
                  >
                    {loadingMethod === method._id ? (
                      <Spinner className={navigationButtons.spinner} />
                    ) : (
                      method.selector_text
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export const paymentMethodMap: Record<string, PaymentMethod> = {
  vipps: PaymentMethod.VIPPS,
  bank: PaymentMethod.BANK,
  avtalegiro: PaymentMethod.AVTALEGIRO,
  quickpay_card: PaymentMethod.QUICKPAY_CARD,
  quickpay_mobilepay: PaymentMethod.QUICKPACK_MOBILEPAY,
  dkbank: PaymentMethod.DKBANK,
};
