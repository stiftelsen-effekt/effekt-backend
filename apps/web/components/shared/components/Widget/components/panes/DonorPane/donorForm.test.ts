import { describe, expect, it } from "vitest";
import { ANONYMOUS_DONOR } from "../../../config/anonymous-donor";
import { createInitialState } from "../../../store/reducer";
import { PaymentMethod } from "../../../types/Enums";
import {
  DonorFormValues,
  donorFromForm,
  initialDonorFormValues,
  validateDonorForm,
} from "./donorForm";

const values = (over: Partial<DonorFormValues> = {}): DonorFormValues => ({
  isAnonymous: false,
  name: "Ola Nordmann",
  email: "ola@example.org",
  ssn: "",
  taxDeduction: false,
  newsletter: false,
  method: PaymentMethod.BANK,
  privacyPolicy: false,
  referralCode: "",
  ...over,
});

const rules = {
  nameField: true,
  privacyPolicyCheckbox: false,
  validSsn: (ssn: string, isAnonymous: boolean) => isAnonymous || ssn === "" || ssn === "valid",
};

describe("validateDonorForm", () => {
  it("accepts a filled in form", () => {
    expect(validateDonorForm(values(), rules)).toEqual({});
  });

  it("wants a name longer than three characters, and an email with an @", () => {
    expect(validateDonorForm(values({ name: " Ola ", email: "ola.example.org" }), rules)).toEqual({
      name: true,
      email: true,
    });
  });

  it("checks the name only where the form shows it", () => {
    expect(validateDonorForm(values({ name: "" }), { ...rules, nameField: false })).toEqual({});
  });

  it("checks nothing but the privacy policy for an anonymous donor", () => {
    const anonymous = values({ isAnonymous: true, name: "", email: "", ssn: "x" });
    expect(validateDonorForm(anonymous, rules)).toEqual({});
    expect(validateDonorForm(anonymous, { ...rules, privacyPolicyCheckbox: true })).toEqual({
      privacyPolicy: true,
    });
  });

  it("uses the site's national id check", () => {
    expect(validateDonorForm(values({ taxDeduction: true, ssn: "nope" }), rules)).toEqual({
      ssn: true,
    });
    expect(validateDonorForm(values({ taxDeduction: true, ssn: "valid" }), rules)).toEqual({});
  });

  it("wants the privacy policy accepted where the form asks for it", () => {
    const withCheckbox = { ...rules, privacyPolicyCheckbox: true };
    expect(validateDonorForm(values(), withCheckbox)).toEqual({ privacyPolicy: true });
    expect(validateDonorForm(values({ privacyPolicy: true }), withCheckbox)).toEqual({});
  });
});

describe("donorFromForm", () => {
  it("tidies the name and email, and leaves the id number out without a tax deduction", () => {
    expect(
      donorFromForm(
        values({ name: " ola nordmann ", email: " Ola@Example.org ", ssn: "123" }),
        true,
      ),
    ).toEqual({
      name: "Ola Nordmann",
      email: "ola@example.org",
      taxDeduction: false,
      ssn: "",
      newsletter: false,
    });
  });

  it("sends the id number as typed, trimmed, with a tax deduction", () => {
    expect(donorFromForm(values({ taxDeduction: true, ssn: " 0101011234 " }), true).ssn).toBe(
      "0101011234",
    );
  });

  it("sends no name where the form has no name field", () => {
    expect(donorFromForm(values(), false).name).toBe("");
  });

  it("registers an anonymous donor as the anonymous donor", () => {
    expect(donorFromForm(values({ isAnonymous: true }), true)).toBe(ANONYMOUS_DONOR);
  });
});

describe("initialDonorFormValues", () => {
  it("starts from the draft the donor left", () => {
    const draft = values({ name: "Kari" });
    expect(
      initialDonorFormValues({ ...createInitialState().donation, donorFormDraft: draft }),
    ).toBe(draft);
  });

  it("starts from the signed-in donor's name and email, and the referral code", () => {
    expect(
      initialDonorFormValues(
        { ...createInitialState().donation, referralCode: "CODE" },
        { name: "Kari", email: "kari@example.org" },
      ),
    ).toMatchObject({ name: "Kari", email: "kari@example.org", referralCode: "CODE" });
  });

  it("starts anonymous, with empty fields, after an anonymous registration", () => {
    const donation = { ...createInitialState().donation, donor: { ...ANONYMOUS_DONOR } };
    expect(initialDonorFormValues(donation)).toMatchObject({
      isAnonymous: true,
      name: "",
      email: "",
      ssn: "",
    });
  });
});
