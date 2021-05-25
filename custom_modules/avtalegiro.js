const DAO = require('./DAO')
const writer = require('./avtalegiro/filewriterutil')
const mail = require('../custom_modules/mail')

/**
 * Generates a claims file to claim payments for AvtaleGiro agreements
 * @param {number} shipmentID A shipment ID from the database
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} paymentClaims Agreements that we should claim payment from
 * @returns {string} The file contents
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
  fileContents += writer.startRecordDeletionRequest()
  fileContents += writer.endRecordDeletionRequest()

  fileContents += writer.endRecordTransmission(paymentClaims)

  return fileContents
}

/**
 * Takes in agreements with a claim date three days from now
 * We are required to notify those who have chosen to be notified
 * three days in advance of any claims.
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements to notify
 */
async function notifyAgreements(agreements) {
  //TODO: Remove or true
  if (config.env === 'production' || true) {
    const tasks = agreements.map((agreement) => mail.sendAvtalegiroNotification(agreement.KID))
    //Send mails in paralell
    const result = await Promise.allSettled(tasks)
    const failed = result.filter(task => task.status === 'rejected')
    for (let i = 0; i < failed.length; i++) {
      console.error(`Failed to send an AvtaleGiro notification ${failed[i].reason}`)
    }
  }
}

/**
 * Takes in agreements recieved on the OCR file
 * They may either need to be created, updated or deleted
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements parced from the file from nets 
 */
async function updateAgreements(agreements) {
  agreements.forEach(async (agreement) => {
    /**
     * It's possible to ask for a complete listing of all the
     * agreements connected to the account. If we've done so
     * we ignore those agreements (as they are already in the database)
     */
    if (!agreement.totalReadout) {
      if (agreement.terminated) {
        await DAO.avtalegiroagreements.terminate(agreement.KID)
      } else {
        const exists = await DAO.avtalegiroagreements.exists(agreement.KID)
        if (!exists) {
          const latestDonation = await DAO.donations.getLatestByKID(agreement.KID)

          if (latestDonation == null) {
            console.error(`AvtaleGiro found in file from nets, but no coresponding agreement exists in DB, and no donatinos have been made with the KID previously (${agreement.KID})`)
          } else {
            await DAO.avtalegiroagreements.add(agreement.KID, latestDonation.sum, new Date(), agreement.notice)
          }
        } else {
          await DAO.avtalegiroagreements.updateNotification(agreement.KID, agreement.notice)
        }
        
        const active = await DAO.avtalegiroagreements.isActive(agreement.KID)
        if (!active) {
          await DAO.avtalegiroagreements.setActive(agreement.KID, true)
        }
      }
    }
  });
}

module.exports = {
  generateAvtaleGiroFile,
  notifyAgreements,
  updateAgreements
}