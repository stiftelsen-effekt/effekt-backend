import { DAO } from "./DAO";
import { EmailTaxUnitReport } from "./DAO_modules/tax";

const config = require("../config.js");
import moment from "moment";
import { DateTime } from "luxon";
const template = require("./template");

import request from "request-promise-native";
import fs from "fs-extra";
import { AvtaleGiroAgreement } from "./DAO_modules/avtalegiroagreements";
import { EmailParams, MailerSend, Recipient, Sender } from "mailersend";
import { APIResponse } from "mailersend/lib/services/request.service";
import { DistributionCauseAreaOrganization, Donor } from "../schemas/types";
import {
  getImpactEstimatesForDonation,
  getImpactEstimatesForDonationByOrg,
  OrganizationImpactEstimate,
} from "./impact";
import { norwegianTaxDeductionLimits } from "./taxdeductions";
import { RequestLocale } from "../middleware/locale";
import { SanitySecurityNoticeVariables } from "../routes/mail";
import {
  Agreement_inflation_adjustments,
  AutoGiro_agreements,
  Avtalegiro_agreements,
} from "@prisma/client";
import { agreementType } from "./inflationadjustment";
import { VippsAgreement } from "./DAO_modules/vipps";

/**
 * @typedef VippsAgreement
 * @property {string} ID
 * @property {number} donorID
 * @property {string} KID
 * @property {number} amount
 * @property {string} status
 * @property {number} monthly_charge_day
 */
// Formatting functions

function formatDateText(date) {
  const months = [
    "januar",
    "februar",
    "mars",
    "april",
    "mai",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "desember",
  ];
  return `${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatCurrency(currencyString) {
  return new Intl.NumberFormat("no-NO", { maximumFractionDigits: 2 }).format(currencyString);
}

// Reusable HTML elements
const sciChanges =
  "<strong>MERK:</strong> Din fordeling ble endret av oss 18.08.2022." +
  'Fra denne datoen støtter vi ikke lenger donasjoner til SCI Foundation. Les mer om denne endringen på <a href="https://gieffektivt.no/articles/nye-evalueringskriterier-for-topplista" style="color: #000000;">våre nettsider</a>.' +
  "<br/><br/>" +
  'Påvirkede donasjoner følger nå i stedet <a href="https://gieffektivt.no/smart-fordeling" style="color: #000000;">Smart fordeling</a>. ' +
  'Om du vil endre dette kan du gå inn på <a href="https://gieffektivt.no/profile" style="color: #000000;">Min Side</a> og oppdatere fordeling på din faste donasjon, eller fylle ut donasjonsskjemaet for en ny donasjon. Ta kontakt om du har spørsmål.' +
  "<br/><br/>";

const replacedOrgsInfo =
  "<strong>MERK</strong>: Din fordeling har blitt endret av oss." +
  "<br/>" +
  "<br/>" +
  "Fra <strong>01.01.2021</strong> støtter vi ikke lenger donasjoner til Deworm the World, The END Fund, Sightsavers og Project Healthy Children." +
  "<br/>" +
  'Fra <strong>18.08.2022</strong> støtter vi ikke lenger donasjoner til SCI Foundation. Les mer om denne endringen på <a href="https://gieffektivt.no/articles/nye-evalueringskriterier-for-topplista" style="color: #000000;">våre nettsider</a>.<br/> ' +
  'Påvirkede donasjoner følger nå i stedet <a href="https://gieffektivt.no/smart-fordeling" style="color: #000000;">Smart fordeling</a>. ' +
  'Om du vil endre dette kan du gå inn på <a href="https://gieffektivt.no/profile" style="color: #000000;">Min Side</a> og oppdatere fordeling på din faste donasjon, eller fylle ut donasjonsskjemaet for en ny donasjon. Ta kontakt om du har spørsmål.' +
  "<br/><br/>";

const taxDeductionInfo =
  "Donasjoner til oss som summerer til kr 500-25 000 i kalenderåret kvalifiserer til skattefradrag. Dersom du har oppgitt fødselsnummer eller organisasjonsnummer registrerer vi dette automatisk på neste års skattemelding. " +
  'Les mer <a href= "https://gieffektivt.no/skattefradrag" style="color: #000000;">her</a>.' +
  "<br/><br/>";

const greeting = "<b>Vennlig hilsen</b><br/>" + "oss i Gi Effektivt" + "<br/><br/>";

const feedback =
  "<span> Hvordan synes du det gikk å donere i dag? </span><br />" +
  "<span>Gi oss tilbakemelding ved å svare på </span>" +
  '<a href="https://forms.gle/P3MwoP7hn9sAQ65VA" style="color: #000000">denne undersøkelsen</a>.' +
  "<span> (4 min)</span>" +
  "<br /><br />";

const footer =
  '<hr color="000" width="100%">' +
  "<br />" +
  '<div style="padding: 0 30px 0 30px;">Vi vil aldri be deg om personlige opplysninger slik som personnummer, kontonummer, kort-informasjon eller passord på e-post.</div>' +
  "<br/><br/>" +
  '<table class="footer" bgcolor="#000" width="100%" border="0" cellspacing="0" cellpadding="0">' +
  "<tr>" +
  '<td align="center" class="footercopy">' +
  '<table width="194" align="left" border="0" cellpadding="0" cellspacing="0">' +
  "<tr>" +
  '<td style="color: #ffffff; font-family: Arial, sans-serif; font-size: 14px;">' +
  "Stiftelsen Gi Effektivt" +
  "<br />" +
  '<a href= "mailto:donasjon@gieffektivt.no" style="color: #ffffff;"><font color="#ffffff">donasjon@gieffektivt.no</a><br/>' +
  "<span>Orgnr. 916 625 308</span><br/><br/>" +
  "Effektiv Altruisme Norge" +
  "<br />" +
  '<a href= "mailto:donasjon@gieffektivt.no" style="color: #ffffff;"><font color="#ffffff">post@effektivaltruisme.no</a><br/>' +
  "<span>Orgnr. 919 809 140</span><br/><br/>" +
  "</td>" +
  "</tr>" +
  "</table>" +
  "<!--[if (gte mso 9)|(IE)]>" +
  '<table width="380" align="left" cellpadding="0" cellspacing="0" border="0">' +
  "<tr>" +
  "<td>" +
  "<![endif]-->" +
  '<table width="75" align="right" border="0" cellpadding="0" cellspacing="0">' +
  "<tr>" +
  "<td>" +
  '<a href="https://gieffektivt.no/">' +
  '<img src="cid:gieffektivt.png" alt="gieffektivt" width="75" height="75" style="display: block;" border="0" />' +
  "</a>" +
  "</td>" +
  "</tr>" +
  "</table>" +
  "<!--[if (gte mso 9)|(IE)]>" +
  '<table width="380" align="left" cellpadding="0" cellspacing="0" border="0">' +
  "<tr>" +
  "<td>" +
  "<![endif]-->" +
  "</td>" +
  "</tr>" +
  "</table>";

const reusableHTML = {
  sciChanges,
  replacedOrgsInfo,
  greeting,
  taxDeductionInfo,
  feedback,
  footer,
};

/**
 * Sends a donation reciept
 * @param {number} donationID
 * @param {string} reciever Reciever email
 */
export async function sendDonationReceipt(donationID, reciever = null) {
  try {
    var donation = await DAO.donations.getByID(donationID);
    if (!donation.email) {
      console.error("No email provided for donation ID " + donationID);
      return false;
    }
  } catch (ex) {
    console.error("Failed to send mail donation reciept, could not get donation by ID");
    console.error(ex);
    return false;
  }

  try {
    var distribution = await DAO.distributions.getSplitByKID(donation.KID);
  } catch (ex) {
    console.error("Failed to send mail donation reciept, could not get donation split by KID");
    console.error(ex);
    return false;
  }

  const impactEstimates = await getImpactEstimatesForDonationByOrg(
    new Date(donation.timestamp),
    parseFloat(donation.sum),
    distribution,
  );

  if (impactEstimates.length === 0) {
    console.warn("Failed to get impact estimates for donation");
  }

  let taxInformation: null | {
    taxDeductionBarWidth: string;
    taxDeductionBarRemainingWidth: string;
    taxDeductionLabel: string;
  } = null;
  if (distribution.taxUnitId) {
    const donationYear = new Date(donation.timestamp).getFullYear();
    const taxUnits = await DAO.tax.getByDonorId(distribution.donorId, RequestLocale.NO);
    const taxUnit = taxUnits.find((tu) => tu.id === distribution.taxUnitId);
    const limits = norwegianTaxDeductionLimits[donationYear];

    if (taxUnit && taxUnit.taxDeductions && limits) {
      const taxUnitYear = taxUnit.taxDeductions.find((td) => td.year === donationYear);

      if (taxUnitYear) {
        const taxDeduction = taxUnitYear.deduction;
        const donationsInYear = taxUnitYear.sumDonations;

        if (taxDeduction >= limits.minimumThreshold) {
          const taxDeductionBarWidth = `${Math.min(
            100,
            (taxDeduction / limits.maximumDeductionLimit) * 100,
          )}%`;
          const taxDeductionBarRemainingWidth = `${Math.min(
            100,
            ((limits.maximumDeductionLimit - taxDeduction) / limits.maximumDeductionLimit) * 100,
          )}%`;
          const taxDeductionLabel = `${formatCurrency(taxDeduction)} kr av ${formatCurrency(
            limits.maximumDeductionLimit,
          )} kr`;
          taxInformation = {
            taxDeductionBarWidth,
            taxDeductionBarRemainingWidth,
            taxDeductionLabel,
          };
        } else if (donationsInYear > 0) {
          const taxDeductionBarWidth = `${Math.min(
            100,
            (donationsInYear / limits.minimumThreshold) * 100,
          )}%`;
          const taxDeductionBarRemainingWidth = `${Math.min(
            100,
            ((limits.minimumThreshold - donationsInYear) / limits.minimumThreshold) * 100,
          )}%`;
          const taxDeductionLabel = `${formatCurrency(donationsInYear)} kr av ${formatCurrency(
            limits.minimumThreshold,
          )} kr minstegrense`;
          taxInformation = {
            taxDeductionBarWidth,
            taxDeductionBarRemainingWidth,
            taxDeductionLabel,
          };
        }
      }
    }
  }

  const split = distribution.causeAreas.reduce<DistributionCauseAreaOrganization[]>(
    (acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        const name = org.widgetDisplayName || org.name || "Unknown";

        acc.push({
          id: org.id,
          name: org.id === 12 ? `${name} ⓘ` : name,
          percentageShare: getOrganizationOverallPercentage(
            org.percentageShare,
            causeArea.percentageShare,
          ).toString(),
        });
      });
      return acc;
    },
    [],
  );

  let hasGiveWellTopCharitiesFund = distribution.causeAreas
    .flatMap((causeArea) => causeArea.organizations.map((org) => org.id))
    .includes(12);

  const organizations = formatOrganizationsFromSplit(split, donation.sum, impactEstimates);

  const yearlyOrgDonations = await DAO.donations.getYearlyAggregateByDonorId(donation.donorId);

  const yearlyDonationsMap = yearlyOrgDonations.reduce<{ [year: number]: number }>((acc, org) => {
    if (acc[org.year]) acc[org.year] += parseFloat(org.value);
    else acc[org.year] = parseFloat(org.value);
    return acc;
  }, {});

  const maxYearDonations = Math.max(...Object.values(yearlyDonationsMap));
  const minYear = Math.min(...Object.keys(yearlyDonationsMap).map((year) => parseInt(year)));
  const totalDonations = Object.values(yearlyDonationsMap).reduce((acc, sum) => acc + sum, 0);

  const donationYearSums = Object.entries(yearlyDonationsMap)
    .map(([year, sum]) => ({
      year,
      sum: formatCurrency(sum),
      barPercentage: `${(sum / maxYearDonations) * 100}%`,
    }))
    .sort((a, b) => parseInt(b.year) - parseInt(a.year));

  const mailResult = await sendTemplate({
    to: reciever || donation.email,
    bcc: "gieffektivt@gmail.com",
    templateId: config.mailersend_donation_receipt_template_id,
    personalization: {
      organizations,
      ...taxInformation,
      donorName: donation.donor,
      donationKID: donation.KID,
      donationDate: moment(donation.timestamp).format("DD.MM.YYYY"),
      paymentMethod: decideUIPaymentMethod(donation.paymentMethod),
      donationTotalSum: formatCurrency(donation.sum) + " kr",
      alltimeDonationsSum: formatCurrency(totalDonations) + " kr",
      firstDonationYear: minYear.toString(),
      donationYearSums,
      hasGiveWellTopCharitiesFund,
    },
  });

  /**
   * HTTP 202 is the status code for accepted
   * If the mail was not accepted, log the error and return false
   * If the mail was accepted, return true
   * Accepted means that the mail was sent to the mail server, not that it was delivered
   * It is scheduled for delivery
   */
  if (mailResult === false) {
    return false;
  } else if (mailResult.statusCode !== 202) {
    console.error("Failed to send donation reciept");
    console.error(mailResult);
    return mailResult.statusCode;
  } else {
    return true;
  }
}

/**
 * Sends a donation reciept
 * @param {number} agreementKid
 * @param {string} reciever Reciever email
 */
export async function sendAutoGiroRegistered(agreementKid, reciever = null) {
  try {
    var agreement = await DAO.autogiroagreements.getAgreementByKID(agreementKid);
    var donor = await DAO.donors.getByKID(agreementKid);
    if (!donor.email) {
      console.error("No email provided for agreement with KID " + agreementKid);
      return false;
    }
  } catch (ex) {
    console.error("Failed to send mail donation reciept, could not get donation by ID");
    console.error(ex);
    return false;
  }

  try {
    var distribution = await DAO.distributions.getSplitByKID(agreement.KID);
  } catch (ex) {
    console.error("Failed to send mail donation reciept, could not get donation split by KID");
    console.error(ex);
    return false;
  }

  const split = distribution.causeAreas.reduce<DistributionCauseAreaOrganization[]>(
    (acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          id: org.id,
          name: org.name,
          percentageShare: (
            (parseFloat(org.percentageShare) / 100) *
            (parseFloat(causeArea.percentageShare) / 100) *
            100
          ).toString(),
        });
      });
      return acc;
    },
    [],
  );

  const organizations = formatOrganizationsFromSplit(split, agreement.amount);

  const mailResult = await sendTemplate({
    to: reciever || donor.email,
    templateId: config.mailersend_autogiro_registered_template_id,
    personalization: {
      donorName: donor.name,
      donationKID: agreement.KID,
      paymentMethod: decideUIPaymentMethod("AutoGiro"),
      donationTotalSum: formatCurrency(agreement.amount) + " kr",
      organizations,
    },
  });

  /**
   * HTTP 202 is the status code for accepted
   * If the mail was not accepted, log the error and return false
   * If the mail was accepted, return true
   * Accepted means that the mail was sent to the mail server, not that it was delivered
   * It is scheduled for delivery
   */
  if (mailResult === false) {
    return false;
  } else if (mailResult.statusCode !== 202) {
    console.error("Failed to send autogiro registered reciept");
    console.error(mailResult);
    return mailResult.statusCode;
  } else {
    return true;
  }
}

function decideUIPaymentMethod(donationMethod) {
  if (donationMethod.toUpperCase() == "BANK U/KID") {
    donationMethod = "Bank";
  }

  return donationMethod;
}

function formatOrganizationsFromSplit(
  split: DistributionCauseAreaOrganization[],
  sum,
  impactEstimates: OrganizationImpactEstimate[] = [],
) {
  return split.map(function (org) {
    var amount = sum * parseFloat(org.percentageShare) * 0.01;
    var roundedAmount = amount > 1 ? Math.round(amount) : 1;

    const impactEstimate = impactEstimates.find((estimate) => estimate.orgId === org.id);

    let outputs = [];
    if (impactEstimate) {
      outputs = impactEstimate.outputs.map((output) => {
        return `${output.roundedNumberOfOutputs} ${output.output}`;
      });
    }

    return {
      name: org.name || "Unknown",
      sum: (roundedAmount != amount ? "~ " : "") + formatCurrency(roundedAmount) + " kr",
      amount: (roundedAmount != amount ? "~ " : "") + formatCurrency(roundedAmount),
      percentage: parseFloat(org.percentageShare) + "%",
      outputs: outputs,
    };
  });
}

/**
 * @param {string} KID
 */
export async function sendDonationRegistered(KID, sum) {
  try {
    try {
      var donor = await DAO.donors.getByKID(KID);
    } catch (ex) {
      console.error("Failed to send mail donation reciept, could not get donor by KID");
      console.error(ex);
      return false;
    }

    if (!donor) {
      console.error(`Failed to send mail donation reciept, no donors attached to KID ${KID}`);
      return false;
    }

    try {
      var distribution = await DAO.distributions.getSplitByKID(KID);
    } catch (ex) {
      console.error("Failed to send mail donation reciept, could not get donation split by KID");
      console.error(ex);
      return false;
    }

    const split = distribution.causeAreas.reduce((acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          // Need to get name
          name: org.name ? org.name.toString() : org.id.toString(),
          // Round to nearest 2 decimals
          percentageShare: getOrganizationOverallPercentage(
            org.percentageShare,
            causeArea.percentageShare,
          ).toString(),
        });
      });
      return acc;
    }, []);

    const organizations = formatOrganizationsFromSplit(split, sum);

    await sendTemplate({
      to: donor.email,
      templateId: config.mailersend_donation_registered_template_id,
      personalization: {
        donationKID: KID,
        donationSum: formatCurrency(sum) + " kr",
        orgAccountNr: config.bankAccount,
        donationTotalSum: formatCurrency(sum) + " kr",
        organizations,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send mail donation registered");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * @param {string} KID
 */
export async function sendPaymentIntentFollowUp(
  KID: string,
  sum: number,
): Promise<boolean | number> {
  try {
    try {
      var donor = await DAO.donors.getByKID(KID);
    } catch (ex) {
      console.error("Failed to send mail donation follow up, could not get donor by KID");
      console.error(ex);
      return false;
    }

    if (!donor) {
      console.error(`Failed to send mail donation follow up, no donors attached to KID ${KID}`);
      return false;
    }

    try {
      var distribution = await DAO.distributions.getSplitByKID(KID);
    } catch (ex) {
      console.error("Failed to send mail donation follow up, could not get donation split by KID");
      console.error(ex);
      return false;
    }

    const split = distribution.causeAreas.reduce((acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          // Need to get name
          name: org.name ? org.name.toString() : org.id.toString(),
          // Round to nearest 2 decimals
          percentageShare: getOrganizationOverallPercentage(
            org.percentageShare,
            causeArea.percentageShare,
          ).toString(),
        });
      });
      return acc;
    }, []);

    const organizations = formatOrganizationsFromSplit(split, sum);

    const response = await sendTemplate({
      to: donor.email,
      bcc: "hakon.harnes@effektivaltruisme.no",
      templateId: config.mailersend_payment_intent_followup_template_id,
      personalization: {
        organizations,
        donationKID: KID,
        donationSum: formatCurrency(sum) + " kr",
        orgAccountNr: config.bankAccount,
        donationTotalSum: formatCurrency(sum) + " kr",
      },
    });

    if (response === false) {
      return false;
    }
    // 202 is the status code for accepted for processing
    return response.statusCode === 202;
  } catch (ex) {
    console.error("Failed to send mail donation follow up");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * @param {string} email
 */
export async function sendFacebookTaxConfirmation(email, fullName, paymentID) {
  try {
    await send({
      subject: "Gi Effektivt - Facebook-donasjoner registrert for skattefradrag",
      reciever: email,
      templateName: "facebookTaxConfirmation",
      templateData: {
        header: "Hei, " + fullName,
        paymentID,
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send facebook tax confirmation email");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * @param {string} agreementCode
 * @param {"PAUSED" | "UNPAUSED" | "STOPPED" | "AMOUNT" | "CHARGEDAY" | "SHARES"} change What change was done
 * @param {string} newValue New value of what was changed (if applicable)
 */
export async function sendVippsAgreementChange(agreementCode, change, newValue = null) {
  try {
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);
    const agreement = await DAO.vipps.getAgreement(agreementId);
    if (!agreement) throw new Error(`Agreement with id ${agreementId} not found`);

    const donor = await DAO.donors.getByID(agreement.donorID);
    const email = donor.email;

    const distribution = await DAO.distributions.getSplitByKID(agreement.KID);
    const organizations = distribution.causeAreas.reduce((acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          // !!! === CAUSE AREAS TODO === !!!
          // Need to get name
          name: org.id.toString(),
          // Round to nearest 2 decimals
          percentage: Math.round(parseFloat(org.percentageShare) * 100) / 100,
        });
      });
      return acc;
    }, []);

    if (agreement.status !== "ACTIVE") return false;

    let changeDesc = "endret";
    if (change === "CANCELLED") changeDesc = "avsluttet";
    if (change === "PAUSED") changeDesc = "satt på pause";
    if (change === "UNPAUSED") changeDesc = "gjenstartet";
    const subject = `Gi Effektivt - Din betalingsavtale via Vipps har blitt ${changeDesc}`;

    if (change === "PAUSED") newValue = formatDate(newValue);
    if (change === "AMOUNT") newValue = formatCurrency(newValue);

    await send({
      subject,
      reciever: email,
      templateName: "vippsAgreementChange",
      templateData: {
        header: "Hei" + (donor.name && donor.name.length > 0 ? " " + donor.name : "") + ",",
        change,
        newValue,
        organizations,
        agreement,
        sum: formatCurrency(agreement.amount),
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send vipps agreement change email");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * @param {"DRAFT" | "CHARGE"} errorType What type of error
 * @param {string} errorMessage Long error message (exception)
 * @param {string} inputData The input data while the error happened
 */
export async function sendVippsErrorWarning(errorType, errorMessage, inputData) {
  try {
    const timestamp = formatTimestamp(new Date());

    let errorDesc = "";
    if (errorType === "DRAFT") errorDesc = "Oppretting av Vipps betalingsavtale feilet";
    if (errorType === "CHARGE") errorDesc = "Trekk av Vipps betalingsavtale feilet";
    const subject = `Varsling om systemfeil - ${errorDesc}`;

    const recipients = [
      "philip.andersen@effektivaltruisme.no",
      "hakon.harnes@effektivaltruisme.no",
    ];

    for (let i = 0; i < recipients.length; i++) {
      await send({
        subject,
        reciever: recipients[i],
        templateName: "vippsErrorWarning",
        templateData: {
          header: errorDesc,
          timestamp,
          errorMessage,
          inputData,
          reusableHTML,
        },
      });
    }

    return true;
  } catch (ex) {
    console.error("Failed to send Vipps agreement error email");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * @param {string} senderUrl The url from where the message was sent
 * @param {string | undefined} senderEmail The email adress of the sender, used for replying
 * @param {string} donorMessage Written message from donor explaining the problem
 * @param {VippsAgreement} agreement Vipps agreement data
 */
export async function sendVippsProblemReport(senderUrl, senderEmail, donorMessage, agreement) {
  try {
    const timestamp = formatTimestamp(new Date());

    const recipients = [
      "philip.andersen@effektivaltruisme.no",
      "hakon.harnes@effektivaltruisme.no",
    ];

    for (let i = 0; i < recipients.length; i++) {
      await send({
        subject: "En donor har rapportert et problem med Vipps",
        reciever: recipients[i],
        templateName: "vippsProblemReport",
        templateData: {
          header: "Problem med Vipps betalingsavtale",
          timestamp,
          senderUrl,
          senderEmail,
          donorMessage,
          agreement,
          reusableHTML,
        },
      });
    }

    return true;
  } catch (ex) {
    console.error("Failed to send Vipps agreement error email");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * Sends donors confirmation of their tax deductible donation for a given year
 * @param {TaxDeductionRecord} taxDeductionRecord
 * @param {number} year The year the tax deductions are counted for
 */
export async function sendTaxDeductions(taxDeductionRecord, year) {
  try {
    await send({
      reciever: taxDeductionRecord.email,
      subject: `Gi Effektivt - Årsoppgave, skattefradrag donasjoner ${year}`,
      templateName: "taxDeduction",
      templateData: {
        header: "Hei " + taxDeductionRecord.firstname + ",",
        donationSum: formatCurrency(taxDeductionRecord.amount),
        fullname: taxDeductionRecord.fullname,
        ssn: taxDeductionRecord.ssn,
        year: year.toString(),
        nextYear: (year + 1).toString(),
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to tax deduction mail");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * @param {string} KID
 * @param {"CANCELLED" | "AMOUNT" | "CHARGEDAY" | "SHARES"} change What change was done
 * @param {string} newValue New value of what was changed (if applicable)
 */
export async function sendAvtaleGiroChange(
  KID: string,
  change: "CANCELLED" | "AMOUNT" | "CHARGEDAY" | "SHARES",
  newValue: string | number = "",
) {
  try {
    const agreement = await DAO.avtalegiroagreements.getByKID(KID);
    const donor = await DAO.donors.getByKID(KID);
    const email = donor.email;

    const distribution = await DAO.distributions.getSplitByKID(KID);
    const organizations = distribution.causeAreas.reduce((acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          name: org.name.toString(),
          percentage: Math.round(parseFloat(org.percentageShare) * 100) / 100,
        });
      });
      return acc;
    }, []);

    console.log(organizations);

    let changeDesc = "endret";
    if (change === "CANCELLED") changeDesc = "avsluttet";
    const subject = `Gi Effektivt - Din AvtaleGiro har blitt ${changeDesc}`;

    if (change === "AMOUNT") newValue = formatCurrency(newValue);

    await send({
      subject,
      reciever: email,
      templateName: "avtaleGiroChange",
      templateData: {
        header: "Hei" + (donor.name && donor.name.length > 0 ? " " + donor.name : "") + ",",
        change,
        newValue,
        organizations,
        agreement,
        sum: formatCurrency(agreement.amount / 100),
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send AvtaleGiro change email");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * Sends donors with avtalegiro agreement a notification of an upcomming claim
 * @param {import('./parsers/avtalegiro.js').AvtalegiroAgreement} agreement
 * @returns {true | number} True if successfull, or an error code if failed
 */
export async function sendAvtalegiroNotification(
  agreement: AvtaleGiroAgreement,
  claimDate: DateTime,
) {
  let donor, split, organizations;

  try {
    donor = await DAO.donors.getByKID(agreement.KID);
  } catch (ex) {
    console.error(
      `Failed to send mail AvtaleGiro claim notification, could not get donor form KID ${agreement.KID}`,
    );
    console.error(ex);
    return false;
  }

  try {
    split = await DAO.distributions.getSplitByKID(agreement.KID);
  } catch (ex) {
    console.error(
      `Failed to send mail AvtaleGiro claim notification, could not get donation split by KID ${agreement.KID}`,
    );
    console.error(ex);
    return false;
  }

  // Agreement amount is stored in øre
  organizations = formatOrganizationsFromSplit(split, agreement.amount / 100);

  try {
    await sendTemplate({
      to: donor.email,
      templateId: config.mailersend_avtalegiro_notification_template_id,
      personalization: {
        organizations,
        paymentMethod: "AvtaleGiro",
        donationKID: agreement.KID,
        donorName: donor.name,
        agreementSum: formatCurrency(agreement.amount / 100) + " kr",
        agreementClaimDate: claimDate.toFormat("dd.MM.yyyy"),
        donationTotalSum: formatCurrency(agreement.amount / 100) + " kr",
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send AvtaleGiro claim notification");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * Sends donors with who just registered an AvtaleGiro an email confirming it
 * @param {import('./parsers/avtalegiro.js').AvtalegiroAgreement} agreement
 * @returns {true | number} True if successfull, or an error code if failed
 */
export async function sendAvtalegiroRegistered(agreement: AvtaleGiroAgreement) {
  let donor;
  let split: {
    causeAreas: {
      id: number;
      percentageShare: string;
      organizations: DistributionCauseAreaOrganization[];
    }[];
  };
  let organizations: { name: string; sum: string; percentage: string }[];

  try {
    donor = await DAO.donors.getByKID(agreement.KID);
  } catch (ex) {
    console.error(
      `Failed to send mail AvtaleGiro registered, could not get donor form KID ${agreement.KID}`,
    );
    console.error(ex);
    return false;
  }

  try {
    split = await DAO.distributions.getSplitByKID(agreement.KID);
  } catch (ex) {
    console.error(
      `Failed to send mail AvtaleGiro registered, could not get donation split by KID ${agreement.KID}`,
    );
    console.error(ex);
    return false;
  }

  const reducedSplit = split.causeAreas.reduce(
    (acc: { name: string; id: number; percentageShare: string }[], causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          name: org.name.toString(),
          id: org.id,
          percentageShare: Math.round(
            (parseFloat(org.percentageShare) / 100) *
              (parseFloat(causeArea.percentageShare) / 100) *
              100,
          ).toString(),
        });
      });
      return acc;
    },
    [],
  );

  // Agreement amount is stored in øre
  organizations = formatOrganizationsFromSplit(reducedSplit, agreement.amount / 100);

  try {
    await send({
      reciever: donor.email,
      subject: `Gi Effektivt - AvtaleGiro opprettet`,
      templateName: "avtaleGiroRegistered",
      templateData: {
        header: "Hei" + (donor.name && donor.name.length > 0 ? " " + donor.name : "") + ",",
        agreementSum: formatCurrency(agreement.amount / 100),
        agreementDate:
          agreement.paymentDate == 0
            ? "siste dagen i hver måned"
            : `${agreement.paymentDate}. hver måned`,
        organizations: organizations,
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send AvtaleGiro registered");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * Sends an email to donors to allow them to easilly update recurring agreement amount in line with inflation
 * @param adjustment
 * @returns
 */
export async function sendAgreementInflationAdjustment(
  adjustment: Agreement_inflation_adjustments,
) {
  try {
    let agreement: Avtalegiro_agreements | VippsAgreement | AutoGiro_agreements;
    let agreementCreated: DateTime;
    if (adjustment.agreement_type === agreementType.avtaleGiro) {
      let agreementId = parseInt(adjustment.agreement_ID);
      let avtalegiroAgreement = await DAO.avtalegiroagreements.getByID(agreementId);
      if (!avtalegiroAgreement) throw new Error("Agreement not found");
      agreement = avtalegiroAgreement;
      agreementCreated = DateTime.fromJSDate(agreement.created);
    } else if (adjustment.agreement_type === agreementType.vipps) {
      let agreementId = adjustment.agreement_ID;
      let vippsagreement = await DAO.vipps.getAgreement(agreementId);
      if (!vippsagreement) throw new Error("Agreement not found");
      agreement = vippsagreement;
      agreementCreated = DateTime.fromJSDate(agreement.timestamp_created as unknown as Date);
    } else if (adjustment.agreement_type === agreementType.autoGiro) {
      let agreementId = parseInt(adjustment.agreement_ID);
      let autogiroAgreement = await DAO.autogiroagreements.getAgreementById(agreementId);
      if (!autogiroAgreement) throw new Error("Agreement not found");
      agreement = autogiroAgreement;
      agreementCreated = DateTime.fromJSDate(agreement.created);
    } else {
      throw new Error("Unknown agreement type");
    }

    const donor = await DAO.donors.getByKID(agreement.KID);

    let donations = await DAO.donations.getAllByKID(agreement.KID);
    donations = donations.filter(
      (d) =>
        d.paymentMethod &&
        d.paymentMethod.toLowerCase().startsWith(adjustment.agreement_type.toLowerCase()),
    );
    const totalDonationSum = donations.reduce((acc, d) => acc + parseFloat(d.sum), 0);

    /* We now look at all the donations for the agreement and sum up the distribution and the impact estimates */
    /* When looping over all the donations, we use a key value approach where we store the sum to the organization and the impact estimates on the org id key, keeping a running count */
    let organizations: {
      [orgId: number]: { name: string; sum: number; impactEstimate: OrganizationImpactEstimate };
    } = {};
    let hasGiveWellTopCharitiesFund = false;
    for (let donation of donations) {
      let distribution = await DAO.distributions.getSplitByKID(donation.KID);
      if (
        !hasGiveWellTopCharitiesFund &&
        distribution.causeAreas.flatMap((c) => c.organizations).find((o) => o.id === 12)
      ) {
        hasGiveWellTopCharitiesFund = true;
      }
      let impactEstimates = await getImpactEstimatesForDonationByOrg(
        new Date(donation.timestamp),
        parseFloat(donation.sum),
        distribution,
      );

      distribution.causeAreas.forEach((causeArea) => {
        causeArea.organizations.forEach((org) => {
          let amount =
            parseFloat(donation.sum) *
            (parseFloat(org.percentageShare) / 100) *
            (parseFloat(causeArea.percentageShare) / 100);
          let impactEstimate = impactEstimates.find((estimate) => estimate.orgId === org.id);

          if (organizations[org.id]) {
            organizations[org.id].sum += amount;
            let existingOutputs = organizations[org.id].impactEstimate.outputs;
            for (let output of impactEstimate.outputs) {
              let existingOutput = existingOutputs.find((o) => o.output === output.output);
              if (existingOutput) {
                existingOutput.numberOfOutputs += output.numberOfOutputs;
              } else {
                existingOutputs.push(output);
              }
            }
          } else {
            organizations[org.id] = {
              name: org.widgetDisplayName || org.name || "Unknown",
              sum: amount,
              impactEstimate: impactEstimate,
            };
          }
        });
      });
    }

    /* We now format the organizations to be used in the email template */
    let formattedOrganizations = Object.entries(organizations).map(([orgId, orgData]) => {
      let outputs =
        orgData.impactEstimate.outputs.map((o) => `${Math.round(o.numberOfOutputs)} ${o.output}`) ??
        [];

      return {
        name: orgId === "12" ? `${orgData.name} ⓘ` : orgData.name,
        sum: formatCurrency(orgData.sum) + " kr",
        amount: orgData.sum,
        percentage: "100%",
        outputs,
      };
    });

    await sendTemplate({
      to: donor.email,
      bcc: "hakon.harnes@effektivaltruisme.no",
      templateId: config.mailersend_inflation_adjustment_template_id,
      personalization: {
        firstName: donor.name.split(" ")[0] ?? "",
        organizations: formattedOrganizations,
        totalDonated: formatCurrency(totalDonationSum) + " kr",
        // Format in local norwegian year and written out month
        agreementStarted: agreementCreated.setLocale("nb").toFormat("MMMM yyyy").toLowerCase(),
        donationTotalSum: formatCurrency(totalDonationSum) + " kr",
        currentAmount: formatCurrency(adjustment.current_amount) + " kr",
        newAmount: formatCurrency(adjustment.proposed_amount) + " kr",
        inflationRate:
          (parseFloat(adjustment.inflation_percentage as unknown as string) * 100)
            .toFixed(1)
            .replace(".", ",") + " %",
        updatingLink: `${config.api_url}/inflation/agreement-update/${adjustment.token}`,
        hasGiveWellTopCharitiesFund,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send inflation adjustment");
    console.error(ex);
    return ex.statusCode;
  }
}

export async function sendTaxYearlyReportNoticeWithUser(report: EmailTaxUnitReport) {
  const formattedUnits = report.units.map((u) => {
    return {
      ...u,
      sum: formatCurrency(u.sum),
    };
  });

  try {
    await send({
      reciever: report.email,
      subject: `Gi Effektivt - Årsoppgave for 2023`,
      templateName: "taxDeductionUser",
      templateData: {
        header: "Hei" + (report.name && report.name.length > 0 ? " " + report.name : "") + ",",
        year: 2023,
        units: formattedUnits,
        donorEmail: report.email,
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send tax yearly report notice");
    console.error(ex);
    return ex.statusCode;
  }
}

export async function sendTaxYearlyReportNoticeNoUser(report: EmailTaxUnitReport) {
  return false;

  const formattedUnits = report.units.map((u) => {
    return {
      ...u,
      sum: formatCurrency(u.sum),
    };
  });

  try {
    await send({
      reciever: report.email,
      subject: `Gi Effektivt - Årsoppgave for 2022`,
      templateName: "taxDeductionNoUser",
      templateData: {
        header: "Hei" + (report.name && report.name.length > 0 ? " " + report.name : "") + ",",
        year: 2022,
        units: formattedUnits,
        donorEmail: report.email,
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send tax yearly report notice");
    console.error(ex);
    return ex.statusCode;
  }
}

export async function sendDonorMissingTaxUnitNotice(
  donor: { email: string; full_name: string; donationsSum: number },
  year: number,
) {
  console.log(`Sending donor missing tax unit notice to ${donor.email}`);

  try {
    await send({
      reciever: donor.email,
      subject: `[Rettelse] Gi Effektivt - Donasjonene dine kvalifiserer til skattefradrag`,
      templateName: "taxDeductionEligibleNotice",
      templateData: {
        header:
          "Hei" +
          (donor.full_name && donor.full_name.length > 0 ? " " + donor.full_name : "") +
          ",",
        year: year,
        donorEmail: donor.email,
        sumDonations: formatCurrency(donor.donationsSum),
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send DonorMissingTaxUnitNotice");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * When a user requests a password reset, they might never have registered in the first place
 * This function sends an email to the user, informing them that they have not registered
 * @param email
 */
export async function sendPasswordResetNoUserEmail(email: string) {
  try {
    await send({
      reciever: email,
      subject: `Gi Effektivt - Glemt passord`,
      templateName: "passwordResetNoUser",
      templateData: {
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send password reset no user email");
    console.error(ex);
    return ex.statusCode;
  }
}

/**
 * Sends OCR file for backup
 * @param {Buffer} fileContents
 */
export async function sendOcrBackup(fileContents) {
  var data = {
    from: "Gi Effektivt <donasjon@gieffektivt.no>",
    to: "hakon.harnes@effektivaltruisme.no",
    bcc: "kopi@gieffektivt.no",
    subject: "OCR backup",
    text: fileContents.toString(),
    inline: [],
  };

  let result = await request.post({
    url: "https://api.eu.mailgun.net/v3/mg.gieffektivt.no/messages",
    auth: {
      user: "api",
      password: config.mailgun_api_key,
    },
    formData: data,
    resolveWithFullResponse: true,
  });
  if (result.statusCode === 200) {
    return true;
  } else {
    return false;
  }
}

/**
 * @typedef MailOptions
 * @prop {string} reciever
 * @prop {string} subject
 * @prop {string} templateName Name of html template, found in views folder
 * @prop {object} templateData Object with template data on the form {key: value, key2: value2 ...}
 */

/**
 * Sends a mail to
 * @param {MailOptions} options
 * @returns {boolean | number} True if success, status code else
 */
async function send(options: {
  reciever: string;
  subject: string;
  templateName: string;
  templateData: Record<string, any>;
}) {
  if (!config.mailgun_api_key && config.env === "development") {
    console.log(
      `Missing mailgun API key not set, not sending email to ${options.reciever}: ${options.subject}`,
    );
    return true;
  }

  const templateRoot = `./${process.env.NODEMON ? "src" : "dist"}/views/mail/${
    options.templateName
  }`;

  var templateRawHTML = await fs.readFile(templateRoot + "/index.html", "utf8");
  var templateHTML = template(templateRawHTML, options.templateData);

  var data = {
    from: "Gi Effektivt <donasjon@gieffektivt.no>",
    to: options.reciever,
    bcc: "kopi@gieffektivt.no",
    subject: options.subject,
    text: "Your mail client does not support HTML email",
    html: templateHTML,
    inline: [],
  };

  var filesInDir = await fs.readdir(templateRoot + "/images/");
  for (var i = 0; i < filesInDir.length; i++) {
    data.inline.push(fs.createReadStream(templateRoot + "/images/" + filesInDir[i]));
  }

  //Exceptions bubble up
  let result = await request.post({
    url: "https://api.eu.mailgun.net/v3/mg.gieffektivt.no/messages",
    auth: {
      user: "api",
      password: config.mailgun_api_key,
    },
    formData: data,
    resolveWithFullResponse: true,
  });
  if (result.statusCode === 200) {
    return true;
  } else {
    return false;
  }
}

export const sendSanitySecurityNotice = async (data: SanitySecurityNoticeVariables) => {
  try {
    const success = await sendTemplate({
      templateId: config.mailersend_sanity_security_notification_template_id,
      to: "teknisk@gieffektivt.no",
      bcc: config.mailersend_security_recipients,
      personalization: {
        fields: data.fields,
        document: data.document,
        sanityUser: data.sanityUser,
      },
    });

    return success;
  } catch (ex) {
    console.error("Failed to send sanity security notice");
    console.error(ex);
    return false;
  }
};

type SendTemplateParameters = {
  to: string;
  bcc?: string | string[];
  templateId: string;
  personalization?: any;
};
async function sendTemplate(params: SendTemplateParameters): Promise<APIResponse | false> {
  const mailersend = new MailerSend({
    apiKey: config.mailersend_api_key,
  });

  const recipients = [new Recipient(params.to)];

  const email = new EmailParams().setTo(recipients).setTemplateId(params.templateId);

  if (params.personalization) {
    email.setPersonalization([
      {
        email: params.to,
        data: params.personalization,
      },
    ]);
  }

  if (params.bcc) {
    if (Array.isArray(params.bcc)) {
      email.setBcc(params.bcc.map((bcc) => new Recipient(bcc)));
    } else {
      email.setBcc([new Recipient(params.bcc)]);
    }
  }

  try {
    const response = await mailersend.email.send(email);
    return response;
  } catch (ex) {
    console.error("Failed to send mailersend email");
    console.error(ex);
    return false;
  }
}

export async function sendPlaintextErrorMail(
  errorMessage: string,
  errorType: string,
  errorContext: string,
) {
  const data = {
    from: "Gi Effektivt <donasjon@gieffektivt.no>",
    to: "hakon.harnes@effektivaltruisme.no",
    subject: `Error: ${errorType}`,
    text: `Error: ${errorType}\nContext: ${errorContext}\n\n${errorMessage}`,
  };

  const result = await request.post({
    url: "https://api.eu.mailgun.net/v3/mg.gieffektivt.no/messages",
    auth: {
      user: "api",
      password: config.mailgun_api_key,
    },
    formData: data,
    resolveWithFullResponse: true,
  });

  if (result.statusCode === 200) {
    return true;
  } else {
    return false;
  }
}

const roundCurrency = (amount: number) => {
  return Math.round(amount * 100) / 100;
};

const getOrganizationOverallPercentage = (percentage: string, causeAreaPercentage: string) => {
  return roundCurrency(
    (parseFloat(percentage) / 100) * (parseFloat(causeAreaPercentage) / 100) * 100,
  );
};

function formatDate(date) {
  return moment(date).format("DD.MM.YYYY");
}

function formatTimestamp(date) {
  const timestamp = moment(date).format("HH:mm - DD.MM.YYYY");
  return timestamp;
}
