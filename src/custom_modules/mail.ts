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
import { DistributionCauseAreaOrganization } from "../schemas/types";

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

  const split = distribution.causeAreas.reduce<DistributionCauseAreaOrganization[]>(
    (acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push(org);
      });
      return acc;
    },
    [],
  );

  const organizations = formatOrganizationsFromSplit(split, donation.sum);

  const mailResult = await sendTemplate({
    from: "donasjon@gieffektivt.no",
    to: reciever || donation.email,
    subject: "Gi Effektivt - Din donasjon er mottatt",
    templateId: config.mailersend_donation_receipt_template_id,
    variables: {
      donorName: donation.donor,
      donationKID: donation.KID,
      donationDate: moment(donation.timestamp).format("DD.MM YYYY"),
      paymentMethod: decideUIPaymentMethod(donation.paymentMethod),
      donationTotalSum: formatCurrency(donation.sum) + " kr",
    },
    personalization: {
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
    console.error("Failed to send donation reciept");
    console.error(mailResult);
    return mailResult.statusCode;
  } else {
    return true;
  }
}

/**
 * Sends a donation reciept with notice of old system
 * @param {number} donationID
 * @param {string} reciever Reciever email
 */
export async function sendEffektDonationReciept(donationID, reciever = null) {
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

  const hasSciInDistribution =
    distribution.causeAreas
      .find((causeArea) => causeArea.id === 1)
      ?.organizations.some((org) => org.id === 2) ?? false;

  try {
    var hasReplacedOrgs = await DAO.donations.getHasReplacedOrgs(donationID);
  } catch (ex) {
    console.log(ex);
    return false;
  }

  const split = distribution.causeAreas.reduce<DistributionCauseAreaOrganization[]>(
    (acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push(org);
      });
      return acc;
    },
    [],
  );

  const organizations = formatOrganizationsFromSplit(split, donation.sum);

  try {
    await send({
      reciever: reciever ? reciever : donation.email,
      subject: "Gi Effektivt - Din donasjon er mottatt",
      templateName: "recieptEffekt",
      templateData: {
        header:
          "Hei" + (donation.donor && donation.donor.length > 0 ? " " + donation.donor : "") + ",",
        donationSum: formatCurrency(donation.sum),
        organizations: organizations,
        donationDate: moment(donation.timestamp).format("DD.MM YYYY"),
        paymentMethod: decideUIPaymentMethod(donation.paymentMethod),
        //Adds a message to donations with inactive organizations
        hasReplacedOrgs,
        hasSciInDistribution,
        reusableHTML,
      },
    });

    return true;
  } catch (ex) {
    console.error("Failed to send donation reciept");
    console.error(ex);
    return ex.statusCode;
  }
}

function decideUIPaymentMethod(donationMethod) {
  if (donationMethod.toUpperCase() == "BANK U/KID") {
    donationMethod = "Bank";
  }

  return donationMethod;
}

function formatOrganizationsFromSplit(split: { name?: string; percentageShare: string }[], sum) {
  return split.map(function (org) {
    var amount = sum * parseFloat(org.percentageShare) * 0.01;
    var roundedAmount = amount > 1 ? Math.round(amount) : 1;

    return {
      name: org.name || "Unknown",
      sum: (roundedAmount != amount ? "~ " : "") + formatCurrency(roundedAmount) + " kr",
      percentage: parseFloat(org.percentageShare) + "%",
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

    const organizations = distribution.causeAreas.reduce((acc, causeArea) => {
      causeArea.organizations.forEach((org) => {
        acc.push({
          // Need to get name
          name: org.name ? org.name.toString() : org.id.toString(),
          // Round to nearest 2 decimals
          percentage: Math.round(parseFloat(org.percentageShare) * 100) / 100,
        });
      });
      return acc;
    }, []);

    var KIDstring = KID.toString();

    await sendTemplate({
      from: "donasjon@gieffektivt.no",
      to: donor.email,
      subject: "Gi Effektivt - Donasjon klar til innbetaling",
      templateId: config.mailersend_donation_registered_template_id,
      variables: {
        donationKID: KID,
        donationSum: formatCurrency(sum) + " kr",
        orgAccountNr: config.bankAccount,
        donationTotalSum: formatCurrency(sum) + " kr",
      },
      personalization: {
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
      from: "donasjon@gieffektivt.no",
      to: donor.email,
      subject: `Gi Effektivt - AvtaleGiro trekk ${claimDate.toFormat("dd.MM.yyyy")}`,
      templateId: config.mailersend_avtalegiro_notification_template_id,
      variables: {
        paymentMethod: "AvtaleGiro",
        donationKID: agreement.KID,
        donorName: donor.name,
        agreementSum: formatCurrency(agreement.amount / 100) + " kr",
        agreementClaimDate: claimDate.toFormat("dd.MM.yyyy"),
        donationTotalSum: formatCurrency(agreement.amount / 100) + " kr",
      },
      personalization: {
        organizations,
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
  let donor, split, organizations;

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

  split = split.causeAreas.reduce((acc, causeArea) => {
    causeArea.organizations.forEach((org) => {
      acc.push({
        name: org.name.toString(),
        percentage: Math.round(parseFloat(org.percentageShare) * 100) / 100,
      });
    });
    return acc;
  });

  // Agreement amount is stored in øre
  organizations = formatOrganizationsFromSplit(split, agreement.amount / 100);

  organizations.forEach((org) => {
    org.amount;
  });

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
      subject: `Gi Effektivt - Årsoppgave for 2022`,
      templateName: "taxDeductionUser",
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

export async function sendTaxYearlyReportNoticeNoUser(report: EmailTaxUnitReport) {
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

/**
{
    "donorName": "",
    "donationKID": "",
    "donationDate": "",
    "paymentMethod": "",
    "donationTotalSum": "",
    "elements": [
      {
          "sum": "",
          "name": "",
          "output": "",
          "percentage": ""
      }
    ]
}
 */
type SendTemplateParameters = {
  from: string;
  to: string;
  subject: string;
  templateId: string;
  variables: { [key: string]: string };
  personalization: any;
};
async function sendTemplate(params: SendTemplateParameters): Promise<APIResponse | false> {
  const mailersend = new MailerSend({
    apiKey: config.mailersend_api_key,
  });

  const sentFrom = new Sender(params.from, "Gi Effektivt");
  const recipients = [new Recipient(params.to)];

  const email = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setTemplateId(params.templateId)
    .setVariables([
      {
        email: params.to,
        substitutions: Object.keys(params.variables).map((key) => ({
          var: key,
          value: params.variables[key],
        })),
      },
    ])
    .setPersonalization([
      {
        email: params.to,
        data: params.personalization,
      },
    ])
    .setSubject(params.subject);

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

function formatDate(date) {
  return moment(date).format("DD.MM.YYYY");
}

function formatTimestamp(date) {
  const timestamp = moment(date).format("HH:mm - DD.MM.YYYY");
  return timestamp;
}
