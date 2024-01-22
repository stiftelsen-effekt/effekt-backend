import { DateTime } from "luxon";
import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";
import libxmljs, { XMLDocument, Document } from "libxmljs";
import { parseEanTaxUnits } from "./parsers/eanTaxUnits";

export async function connectDonationsForFirstTaxUnit(donorId: number, taxUnitId: number) {
  /**
   * If we add the donors first tax unit, we want to connect all donations for the
   * current year and the previous year to the new tax unit. We should avoid connecting
   * donations from previous years, as we have already reported them to the tax authorities.
   */

  // Get all distributions for the donor
  const { distributions } = await DAO.distributions.getAllByDonor(donorId);

  // Update the distributions to have the new tax unit
  await DAO.distributions.connectFirstTaxUnit(donorId, taxUnitId);

  // Get all the donations given before the current year
  const donations = await DAO.donations.getByDonorId(donorId);

  const filteredDonations = donations.filter((donation) => {
    const donationDate = new Date(donation.timestamp);
    const currentYear = new Date().getFullYear();
    return donationDate.getFullYear() < currentYear;
  });
  console.log(filteredDonations);

  const distributionsNeedingReplacement = new Set(
    filteredDonations.map((donation) => donation.KID),
  );
  console.log(distributionsNeedingReplacement);

  for (const KID of distributionsNeedingReplacement) {
    /**
     * First we make a copy of the old distribution (without a tax unit)
     * and add it with a new KID
     */
    const replacementKID = await donationHelpers.createKID(15, donorId);
    const oldDistribution = distributions.find((distribution) => distribution.kid === KID);

    const newDistribution = {
      ...oldDistribution,
      kid: replacementKID,
    };

    await DAO.distributions.add(newDistribution);

    /**
     * Then we update the donations from before the current year to use the new KID
     * for the distribution that has no tax unit (since those donations are already reported)
     */
    const previousYearStart = DateTime.now().minus({ years: 1 }).startOf("year");
    await DAO.donations.updateKIDBeforeTimestamp(KID, replacementKID, previousYearStart);

    console.log("Updated KID for donations before current year", KID, replacementKID);
  }
}

export async function setTaxUnitOnDistribution(kid: string, taxUnitId: number) {
  const distribution = await DAO.distributions.getSplitByKID(kid);

  if (!distribution) {
    throw new Error("Distribution not found");
  }

  if (distribution.taxUnitId) {
    throw new Error("Distribution already has a tax unit");
  }

  // Create a duplicate of the distribution
  const newDistribution = {
    ...distribution,
  };

  const newKID = await donationHelpers.createKID(15, distribution.donorId);
  newDistribution.kid = newKID;

  // Add the new distribution
  await DAO.distributions.add(newDistribution);

  // Update the donations to use the new KID
  const previousYearStart = DateTime.now().minus({ years: 1 }).startOf("year");
  await DAO.donations.updateKIDBeforeTimestamp(kid, newKID, previousYearStart);

  // Set the tax unit on the original distribution
  await DAO.distributions.addTaxUnitToDistribution(kid, taxUnitId);
}

export async function createXMLReportToTaxAuthorities(
  year: number,
  minSum: number,
  eanUnitsCsv: Buffer,
  contactInformation: ContactInformation,
): Promise<XMLDocument> {
  const geTaxUnits = await DAO.tax.getTaxXMLReportUnits(year);

  const taxUnitsMap = new Map<string, { name: string; sum: number }>();
  geTaxUnits.forEach((unit) => {
    const sum = parseFloat(unit.donationsSum);
    taxUnitsMap.set(unit.ssn, {
      name: unit.full_name,
      sum,
    });
  });

  const eanTaxUnits = await parseEanTaxUnits(eanUnitsCsv);

  for (const unit of eanTaxUnits) {
    console.log(unit);
    console.log(taxUnitsMap.has(unit.ssn));
    if (unit.gieffektivt && !taxUnitsMap.has(unit.ssn)) {
      throw new Error(
        `Report says that tax unit ${unit.ssn} has donated to GE, but we don't have any donations for the unit in the database`,
      );
    } else if (!unit.gieffektivt && taxUnitsMap.has(unit.ssn)) {
      throw new Error(
        `Report says that tax unit ${unit.ssn} has not donated to GE, but we have donations for the unit in the database`,
      );
    }

    if (taxUnitsMap.has(unit.ssn)) {
      taxUnitsMap.set(unit.ssn, {
        ...taxUnitsMap.get(unit.ssn),
        sum: taxUnitsMap.get(unit.ssn).sum + unit.sum,
      });
      console.log(
        `Adding ${unit.sum} to ${unit.ssn} from EAN report, total is now ${
          taxUnitsMap.get(unit.ssn).sum
        }`,
      );
    } else {
      taxUnitsMap.set(unit.ssn, {
        name: unit.name,
        sum: unit.sum,
      });
      console.log(
        `Adding ${unit.sum} to a new unit, ${unit.ssn} from EAN report, total is now ${
          taxUnitsMap.get(unit.ssn).sum
        }`,
      );
    }
  }

  const giftEntities = Array.from(taxUnitsMap)
    .filter((unit) => unit[1].sum >= minSum)
    .map((unit) => ({
      identificationNumber: unit[0],
      amount: unit[1].sum,
      name: unit[1].name,
    }));

  const doc = writeXMLTaxReport(giftEntities, contactInformation, year);

  const xsdContent = await fetch(
    "https://www.skatteetaten.no/contentassets/3bcbe50b50924c4297c2b62eb89a38da/v2_0_3/gavefrivilligorganisasjon_v2_0.xsd",
  ).then((res) => res.text());

  const valid = validateXml(doc, xsdContent);
  console.log("XML is valid:", valid);

  if (!valid) {
    //throw new Error("XML is invalid when validating against XSD");
  }

  return doc;
}

type GiftEntity = { name: string; identificationNumber: string; amount: number };
type ContactInformation = { name: string; phoneNumber: string; email: string; smsNumber: string };
const writeXMLTaxReport = (
  giftEntities: GiftEntity[],
  contactInformation: ContactInformation,
  year: number,
) => {
  const doc = Document();
  const root = doc.node("melding").attr({
    xmlns: "urn:ske:fastsetting:innsamling:gavefrivilligorganisasjon:v2",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xsi:schemaLocation":
      "urn:ske:fastsetting:innsamling:gavefrivilligorganisasjon:v2 gavefrivilligorganisasjon_v2_0.xsd ",
  });

  const leveranse = root.node("leveranse");

  // Add oppgavegiver and other static elements
  const oppgavegiver = leveranse.node("oppgavegiver");
  oppgavegiver.node("organisasjonsnummer", "919809140");
  oppgavegiver.node("organisasjonsnavn", "Effektiv Altruisme Norge");
  const kontaktinformasjon = oppgavegiver.node("kontaktinformasjon");
  kontaktinformasjon.node("navn", contactInformation.name);
  kontaktinformasjon.node("telefonnummer", contactInformation.phoneNumber);
  kontaktinformasjon.node("varselEpostadresse", contactInformation.email);
  kontaktinformasjon.node("varselSmsMobilnummer", contactInformation.smsNumber);

  leveranse.node("inntektsaar", year.toString());
  leveranse.node("oppgavegiversLeveranseReferanse", "skatteraport" + +new Date());
  leveranse.node("leveransetype", "ordinaer");

  let cumulativeRoundingError = 0;

  giftEntities.forEach((entity) => {
    const oppgave = leveranse.node("oppgave");
    const oppgaveeier = oppgave.node("oppgaveeier");
    if (entity.identificationNumber.length === 11) {
      oppgaveeier.node("foedselsnummer", entity.identificationNumber);
    } else if (entity.identificationNumber.length === 9) {
      oppgaveeier.node("organisasjonsnummer", entity.identificationNumber);
    }
    oppgaveeier.node("navn", entity.name); // Replace with actual name
    oppgave.node("beloep", Math.round(entity.amount).toFixed(0));

    const roundingError = entity.amount - Math.round(entity.amount);
    if (roundingError !== 0) {
      console.log("Rounding error", roundingError);
    }
    cumulativeRoundingError += roundingError;
  });

  console.log("Cumulative rounding error", cumulativeRoundingError);

  const oppgaveoppsummering = leveranse.node("oppgaveoppsummering");
  oppgaveoppsummering.node("antallOppgaver", giftEntities.length.toString());
  oppgaveoppsummering.node(
    "sumBeloep",
    Math.round(giftEntities.reduce((acc, curr) => acc + curr.amount, 0)).toFixed(0),
  );

  return doc;
};

const validateXml = (doc: XMLDocument, xsdContent: string): boolean => {
  const xsdDoc = libxmljs.parseXml(xsdContent);
  const result = doc.validate(xsdDoc);
  const errors = doc.validationErrors;
  console.log(errors);
  console.log(result);
  return false;
};
