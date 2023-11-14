import { createHash } from "crypto";
import { DAO } from "./DAO";
import { AdoveoFundraiserTransactionReportRow, parseFundraiserReport } from "./parsers/adoveo";
import { DateTime } from "luxon";
import { Adoveo_fundraiser_transactions } from "@prisma/client";
import { donationHelpers } from "../custom_modules/donationHelpers";

export async function processFundraisingReport(report: Buffer) {
  const data = parseFundraiserReport(report);

  // Temp hard coded distribution
  const split = [{ id: 12, share: "100" }];

  for (let row of data) {
    await addRecord(row, split);
  }
}

async function addRecord(row: AdoveoFundraiserTransactionReportRow, split: any) {
  console.log("Processing row", row);

  // To prevent duplicate entries, we check if the transaction already exists
  // We get no unique identifier from Adoveo, so we have to use a hash of the fields
  const hash = createHash("md5");
  hash.update(row.date);
  hash.update(row.senderName);
  hash.update(row.senderEmail);
  hash.update(row.senderPhone);
  hash.update(row.amount);
  const hashString = hash.digest("hex");

  console.log("Hash", hashString);

  // Attempt to find donor by email
  let donorId = await DAO.donors.getIDbyEmail(row.senderEmail);

  if (!donorId) {
    console.log("Donor not found, creating new one");
    // Create a new temporary donor for storage
    donorId = await DAO.donors.add({
      email: row.senderEmail,
      full_name: row.senderName,
    });
  }

  // If donor has only one tax unit, use that
  const taxUnits = await DAO.tax.getByDonorId(donorId);
  const activeTaxUnits = taxUnits.filter((taxUnit) => taxUnit.archived === null);

  let taxUnitId: number | undefined;
  if (activeTaxUnits.length === 1) {
    console.log("Donor has only one tax unit, using that");
    taxUnitId = activeTaxUnits[0].id;
  }

  let KID = await DAO.distributions.getKIDbySplit(split, donorId, false, taxUnitId);

  if (!KID) {
    console.log("No KID found, creating new one");
    const newKID = await donationHelpers.createKID();
    console.log("New KID", newKID);
    await DAO.distributions.add(split, newKID, donorId, taxUnitId, false);
    KID = newKID;
  }

  const formattedTimestamp = DateTime.fromFormat(row.date, "yyyy-MM-dd HH:mm:ss");
  if (!formattedTimestamp.isValid) {
    throw new Error("Invalid date format");
  }

  const transaction: Omit<Adoveo_fundraiser_transactions, "ID"> = {
    KID: KID,
    Sum: row.amount as any,
    Timestamp: formattedTimestamp.toJSDate(),
    Sender_email: row.senderEmail,
    Sender_phone: row.senderPhone,
    Status: row.status,
    Location: row.location,
    Hash: hashString,
  };

  try {
    await DAO.adoveo.addFundraiserTransaction(transaction);
    console.log("Added transaction", transaction);
  } catch (ex) {
    if (ex.code === "ER_DUP_ENTRY") {
      console.log("Transaction already exists, skipping");
      return;
    }
    throw ex;
  }
}
