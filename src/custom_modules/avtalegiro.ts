import { sendAvtalegiroNotification } from "./mail";
import { DAO } from "./DAO";
import { DateTime } from "luxon";

const writer = require("./avtalegiro/filewriterutil");
const config = require("../config");
const workdays = require("norwegian-workdays")

/**
 * Generates a claims file to claim payments for AvtaleGiro agreements
 * @param {number} shipmentID A shipment ID from the database
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements that we should claim payment from
 * @param {DateTime} dueDate Due date
 * @returns {Buffer} The file buffer
 */
export async function generateAvtaleGiroFile(shipmentID, agreements, dueDate) {
  const today = DateTime.fromJSDate(new Date());
  let fileContents = "";

  fileContents += writer.startRecordTransmission(shipmentID);

  /**
   * Claim requests
   */
  let claims = [];
  for (let i = 0; i < agreements.length; i++) {
    fileContents += writer.startRecordPaymentAssignment(i, shipmentID);

    let assignmentClaims = [];
    /**
     * Right now, we only send one transaction
     * We are able to send claims up to 12 months ahead of time
     */
    for (
      let transactionNumber = 1;
      transactionNumber <= 1;
      transactionNumber++
    ) {
      const claim = agreements[i];
      const donor = await DAO.donors.getByKID(claim.KID);
      fileContents += writer.firstAndSecondLine(
        claim,
        donor,
        "02",
        transactionNumber,
        dueDate
      );
      assignmentClaims.push(claim);
    }

    fileContents += writer.endRecordPaymentAssignment(
      assignmentClaims,
      dueDate,
      dueDate
    );
    claims.push(...assignmentClaims);
  }

  /**
   * Deletion requests
   * Currently not utilized
   */

  let deletions = [];
  /*
  fileContents += writer.startRecordDeletionRequest()
  fileContents += writer.endRecordDeletionRequest(date)
  */

  fileContents += writer.endRecordTransmission(claims, deletions, dueDate);

  const fileBuffer = Buffer.from(fileContents, "utf8");

  return fileBuffer;
}

/**
 * @typedef NotifyAgreementsResult
 * @property {number} success
 * @property {number} failed
 */

/**
 * Takes in agreements with a claim date three days from now
 * We are required to notify those who have chosen to be notified
 * three days in advance of any claims.
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements to notify
 * @returns {NotifyAgreementsResult}
 */
export async function notifyAgreements(agreements) {
  let result = {
    success: 0,
    failed: 0,
  };
  if (config.env === "production") {
    for (let i = 0; i < agreements.length; i++) {
      try {
        if ((await sendAvtalegiroNotification(agreements[i])) === true) {
          result.success++;
        } else {
          result.failed++;
        }
      } catch (ex) {
        result.failed++;
      }
    }
  } else {
    result.success = agreements.length;
    result.failed = 0;
  }

  return result;
}

/**
 * @typedef UpdateAgreementsResult
 * @property {number} activated
 * @property {number} updated
 * @property {number} added
 * @property {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} failed
 */

/**
 * Takes in agreements recieved on the OCR file
 * They may either need to be created, updated or deleted
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements parced from the file from nets
 * @returns {UpdateAgreementsResult}
 */
export async function updateAgreements(agreements) {
  /** @type {UpdateAgreementsResult} */
  let result = {
    activated: 0,
    updated: 0,
    added: 0,
    terminated: 0,
    failed: [],
  };

  for (let i = 0; i < agreements.length; i++) {
    const agreement = agreements[i];
    /**
     * It's possible to ask for a complete listing of all the
     * agreements connected to the account. If we've done so
     * we ignore those agreements (as they are already in the database)
     */
    if (!agreement.totalReadout) {
      if (agreement.isTerminated) {
        await DAO.avtalegiroagreements.cancelAgreement(agreement.KID);
        result.terminated++;
        continue;
      }

      const exists = await DAO.avtalegiroagreements.exists(agreement.KID);
      if (!exists) {
        /**
         * The agreement is not stored in our database. This may be the case
         * if the user has created an agreement from their own bank.
         * We then check if the user has donated to us before with the KID
         * specified. It so, we create a new agreement with tha same limit
         * and todays date as claim date.
         */
        const latestDonation = await DAO.donations.getLatestByKID(
          agreement.KID
        );

        if (latestDonation == null) {
          console.error(
            `AvtaleGiro found in file from nets, but no coresponding agreement exists in DB, and no donatinos have been made with the KID previously (${agreement.KID})`
          );
          result.failed.push(agreement);
          continue;
        } else {
          await DAO.avtalegiroagreements.add(
            agreement.KID,
            latestDonation.sum,
            new Date(),
            agreement.notice
          );
          result.added++;
        }
      } else {
        /**
         * The agreement does exist, and we update the agreement in the DB to
         * reflect the chosen notification setting (yes/no).
         */
        await DAO.avtalegiroagreements.updateNotification(
          agreement.KID,
          agreement.notice
        );
        result.updated++;
      }

      /**
       * If the agreement is not active in the database, we activate it.
       * An agreement may either be activated, changed or terminated.
       * Thus, if it is activated or changed, we know it should be active.
       */
      const active = await DAO.avtalegiroagreements.isActive(agreement.KID);
      if (!active) {
        await DAO.avtalegiroagreements.setActive(agreement.KID, true);
        result.activated++;
      }
    }
  }

  return result;
}

/**
 * A function that returns a list of due dates for payment claims
 * We are required to send claims four banking days in advance of the due date
 * Holidays and weekends are not counted as banking days
 * Takes in a date to calculate the due date from
 * @returns 
 */
export function getDueDates(date: DateTime) {
  // Start iterating backwards 30 days from the date given
  // Keep going until 4 days after the date given
  // Add all the dates that have 4 banking days in between
  // Return the list of dates

  // We only send claims on banking days
  // Thus, we start by checking if the date given is a banking day
  if (!workdays.isWorkingDay(date.toJSDate())) {
    return [];
  }

  let dueDates: DateTime[] = [];
  let iterationDate = date.plus({ days: 30 });
  while (iterationDate >= date.plus({ days: 4 })) {
    let bankingDays = 0;
    let innerIterationDate = iterationDate.minus({ days: 1 });
    while (innerIterationDate >= date) {
      if (workdays.isWorkingDay(innerIterationDate.toJSDate())) {
        bankingDays++;
      }
      innerIterationDate = innerIterationDate.minus({ days: 1 });
    }

    if (bankingDays === 4) {
      dueDates.push(iterationDate);
    }

    iterationDate = iterationDate.minus({ days: 1 });
  }

  // Debug table to visualize the due dates
  // printDueDatesTable(date, dueDates);

  return dueDates;
}

/**
 * Debugging helper for due date calculation
 * @param date 
 * @param dueDates 
 */
function printDueDatesTable(date: DateTime, dueDates: DateTime[]) {
  console.log('')
  console.log('')

  let tableWidth = dueDates[0].diff(date, "days").days + 1

  console.log('-'.repeat(tableWidth*8))

  // Bold text
  console.log(`Due dates for claims on \x1b[1m${date.toFormat('dd.MM.yyyy')}\x1b[0m`)
  console.log('')


  // Letter for the day, e.g. Mon for Monday

  console.log(Array.from({length: tableWidth}, (_, i) => date.plus({day: i}).toFormat('ccc')).join('\t'))
  console.log(Array.from({length: tableWidth}, (_, i) => date.plus({day: i}).day).join('\t'))
  // Green square is a banking day, yellow is not
  console.log(Array.from({length: tableWidth}, (_, i) => workdays.isWorkingDay(date.plus({day: i}).toJSDate()) ? '🟢' : '🟡').join('\t'))
  // Checkmark if the date is a due date
  console.log(Array.from({length: tableWidth}, (_, i) => dueDates.map(d => d.toISO()).includes(date.plus({day: i}).toISO()) ? '✅' : '').join('\t'))
  console.log('-'.repeat(tableWidth*8))

  console.log('')
  console.log('')
}