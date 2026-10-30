import { DAO } from "./DAO";
import { parseDirectAmfDonationsReport } from "./parsers/amf";
import { DistributionInput } from "../schemas/types";
import { KID } from "./KID";

const DIRECT_AMF_PAYMENT_ID = 16;
const EFFEKT_FOUNDATION_META_OWNER_ID = 1;
const ANON_DONOR_ID = 1464;

const AMF_DISTRIBUTION: Pick<DistributionInput, "causeAreas"> = {
  causeAreas: [
    {
      id: 1, // Global Health
      percentageShare: "100",
      standardSplit: false,
      organizations: [
        {
          id: 1, // Against Malaria Foundation
          percentageShare: "100",
        },
      ],
    },
  ],
};

export const processAmfDonations = async (report: Buffer) => {
  const transactions = parseDirectAmfDonationsReport(report);
  if (!transactions) {
    console.error("Parsing amf failed.");
    return false;
  }

  let result = {
    addedCount: 0,
    addedSum: 0,
    failedCount: 0,
    failedSum: 0,
  };

  for (let transaction of transactions) {
    let donorId;
    if (transaction.email && transaction.email.trim() !== "") {
      donorId = await DAO.donors.getIDbyEmail(transaction.email.trim());

      if (!donorId) {
        donorId = await DAO.donors.getIDbyEmail(transaction.email.trim().toLowerCase());
      }

      if (!donorId) {
        donorId = await DAO.donors.add({
          email: transaction.email.trim(),
          full_name: transaction.name.trim(),
          newsletter: false,
        });
      }
    } else if (transaction.name === "Anonymous") {
      donorId = ANON_DONOR_ID;
    } else {
      const genericEmail = `donasjon+${transaction.name
        .trim()
        .toLowerCase()
        .replace(/ /g, "_")}@gieffektivt.no`;

      donorId = await DAO.donors.getIDbyEmail(genericEmail);

      if (!donorId) {
        donorId = await DAO.donors.add({
          full_name: transaction.name,
          email: genericEmail,
          newsletter: false,
        });
      }
    }

    const distributionInput: DistributionInput = {
      ...AMF_DISTRIBUTION,
      donorId: donorId,
      taxUnitId: null,
    };

    let donationKID = await DAO.distributions.getKIDbySplit(distributionInput);
    if (!donationKID) {
      donationKID = await KID.generate();
      const success = await DAO.distributions.add(
        { ...distributionInput, kid: donationKID },
        EFFEKT_FOUNDATION_META_OWNER_ID,
      );
      if (!success) {
        console.error(
          `Failed to add distribution for transaction ${transaction.number} with KID ${donationKID}`,
        );
        result.failedCount = result.failedCount + 1;
        result.failedSum = result.failedSum + transaction.amountNOK;
        continue;
      }
    }
    let donationId;
    try {
      donationId = await DAO.donations.add(
        donationKID,
        DIRECT_AMF_PAYMENT_ID,
        transaction.amountNOK,
        transaction.date.toJSDate(),
        `AMF.${transaction.number}`,
        EFFEKT_FOUNDATION_META_OWNER_ID,
      );
      console.log(
        `Added donation with ID ${donationId}, sum ${
          transaction.amountNOK
        }, date ${transaction.date.toISODate()}, external reference AMF.${transaction.number}`,
      );
    } catch (ex) {
      if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
        console.log("Skipping existing donation");
        continue;
      } else {
        throw ex;
      }
    }

    if (!donationId) {
      result.failedCount = result.failedCount + 1;
      result.failedSum = result.failedSum + transaction.amountNOK;
    } else {
      result.addedCount = result.addedCount + 1;
      result.addedSum = result.addedSum + transaction.amountNOK;
    }
  }

  return result;
};
