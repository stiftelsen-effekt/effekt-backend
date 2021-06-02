const DAO = require('./DAO')
const writer = require('./avtalegiro/filewriterutil')
const mail = require('../custom_modules/mail')
const config = require('../config')
const { task } = require('gulp')

/**
 * Generates a claims file to claim payments for AvtaleGiro agreements
 * @param {number} shipmentID A shipment ID from the database
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} paymentClaims Agreements that we should claim payment from
 * @returns {Buffer} The file buffer
 */
async function generateAvtaleGiroFile(shipmentID, paymentClaims) {
  let fileContents = ''

  fileContents += writer.startRecordTransmission(shipmentID)
  
  /**
   * Claim requests
   */
  fileContents += writer.startRecordPaymentClaims()

  for (let transactionNumber = 0; transactionNumber < paymentClaims.length; transactionNumber++) {
    const claim = paymentClaims[transactionNumber]
    const donor = await DAO.donors.getByKID(claim.KID)
    fileContents += writer.firstAndSecondLine(claim, donor, "02", transactionNumber)
  }

  fileContents += writer.endRecordPaymentClaims(paymentClaims)

  /**
   * Deletion requests
   * Currently not utilized
   */

  /*
  fileContents += writer.startRecordDeletionRequest()
  fileContents += writer.endRecordDeletionRequest()
  */

  fileContents += writer.endRecordTransmission(paymentClaims)

  const fileBuffer = Buffer.from(fileContents, 'utf8')

  return fileBuffer
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
async function notifyAgreements(agreements) {
  let result = {
    success: 0,
    failed: 0
  }
  if (config.env === 'production') {
    const tasks = agreements.map((agreement) => mail.sendAvtalegiroNotification(agreement))
    //Send mails in paralell
    const result = await Promise.allSettled(tasks)
    const failed = result.filter(task => task.status === 'rejected')
    for (let i = 0; i < failed.length; i++) {
      console.error(`Failed to send an AvtaleGiro notification ${failed[i].reason}`)
    }

    result.success = tasks.length - failed.length
    result.failed = failed.length
  } else {
    result.success = agreements.length
    result.failed = 0
  }

  return result
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
async function updateAgreements(agreements) {
  /** @type {UpdateAgreementsResult} */
  let result = {
    activated: 0,
    updated: 0,
    added: 0,
    terminated: 0,
    failed: []
  }

  for (let i = 0; i < agreements.length; i++) {
    const agreement = agreements[i]
    /**
     * It's possible to ask for a complete listing of all the
     * agreements connected to the account. If we've done so
     * we ignore those agreements (as they are already in the database)
     */
    if (!agreement.totalReadout) {
      if (agreement.terminated) {
        await DAO.avtalegiroagreements.terminate(agreement.KID)
        result.terminated++
        continue
      } 

      const exists = await DAO.avtalegiroagreements.exists(agreement.KID)
      if (!exists) {
        /**
         * The agreement is not stored in our database. This may be the case
         * if the user has created an agreement from their own bank.
         * We then check if the user has donated to us before with the KID
         * specified. It so, we create a new agreement with tha same limit
         * and todays date as claim date.
         */
        const latestDonation = await DAO.donations.getLatestByKID(agreement.KID)

        if (latestDonation == null) {
          console.error(`AvtaleGiro found in file from nets, but no coresponding agreement exists in DB, and no donatinos have been made with the KID previously (${agreement.KID})`)
          result.failed.push(agreement)
          continue
        } else {
          await DAO.avtalegiroagreements.add(agreement.KID, latestDonation.sum, new Date(), agreement.notice)
          result.added++
        }
      } else {
        /**
         * The agreement does exist, and we update the agreement in the DB to
         * reflect the chosen notification setting (yes/no).
         */
        await DAO.avtalegiroagreements.updateNotification(agreement.KID, agreement.notice)
        result.updated++
      }
      
      /**
       * If the agreement is not active in the database, we activate it.
       * An agreement may either be activated, changed or terminated.
       * Thus, if it is activated or changed, we know it should be active.
       */
      const active = await DAO.avtalegiroagreements.isActive(agreement.KID)
      if (!active) {
        await DAO.avtalegiroagreements.setActive(agreement.KID, true)
        result.activated++
      }
    }
  }

  return result
}

module.exports = {
  generateAvtaleGiroFile,
  notifyAgreements,
  updateAgreements
}