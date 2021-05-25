const DAO = require('./DAO')
const config = require('../config')
const luxon = require('luxon')

async function generateAvtaleGiroFile(shipmentID, paymentClaims) {
  let fileContents = ''

  fileContents += getStartRecordTransmission(shipmentID)
  
  /**
   * Claim requests
   */
  fileContents += getStartRecordPaymentClaims()

  for (let transactionNumber = 0; transactionNumber < paymentClaims.length; transactionNumber++) {
    const claim = paymentClaims[transactionNumber]
    fileContents += await getFirstAndSecondLine(claim, 02, transactionNumber)
  }

  fileContents += getEndRecordPaymentClaims(paymentClaims)

  /**
   * Deletion requests
   * Currently not utilized
   */
  fileContents += getStartRecordDeletionRequest()
  fileContents += getEndRecordDeletionRequest()

  fileContents += getEndRecordTransmission(paymentClaims)

  return fileContents
}

function getStartRecordTransmission(shipmentID) { 
  //TODO: Use config
  //let customerId = config.nets_customer_id;
  let customerId = '00230456';

  var line = `NY000010${customerId.padStart(8,'0')}${shipmentID.toString().padStart(7,'0')}00008080`
  line = line.padEnd(80, '0')
  line += '<br>'
  return line;
}

function getStartRecordPaymentClaims() {
  var line =`NY210020`
  line = line.padEnd(17, '0')
  // Oppdragsnr.
  line += '1'.padStart(7, '0')
  // Accountnr.
  line += '15062995960'
  line = line.padEnd(80, '0')

  line += '<br>'
  return line
}


async function getFirstAndSecondLine(agreement, type, transactionNumber) {
  /**
   * First line
   */
  var firstLine =`NY21${type}30${transactionNumber.toString().padStart(7,'0')}`
  let agreementDate = luxon.DateTime.fromJSDate(new Date())
  firstLine += agreementDate.toFormat("ddLLyy")
  firstLine = firstLine.padEnd(32, '0')

  var amount = agreement.amount
  amount.toString().padStart(17, '0')
  firstLine += amount

  var KID = agreement.KID
  KID.toString().padStart(25, " ")
  firstLine += KID
  
  firstLine = firstLine.padEnd(80, '0')
  firstLine += "<br>"

  /**
   * Second line
   */
  
  //TODO: Trouble with distribution and combining table must be fixed
  /*
  const donor = await DAO.donors.getByKID(agreement.KID)
  const shortname = donor.name.toUpperCase().substr(0,10).replace(/\s+/g, '').padStart(10, 0)
  */
  const shortname = 'Håkon Harnes'.toUpperCase().substr(0,10).replace(/\s+/g, '').padStart(10, 0)

  var secondLine =`NY210231${transactionNumber.toString().padStart(7,'0')}${shortname}`

  secondLine = secondLine.padEnd(80, '0')

  /**
   * Combine lines
   */
  lines = `${firstLine}${secondLine}`
  lines += '<br>'
  return lines
}

function getEndRecordPaymentClaims(claims) {
  var line =`NY210088`

  //Number of transactions
  line += claims.length.toString().padStart(8,'0')

  //Number of records, including start and end record
  line += (claims.length*2+2).toString().padStart(8,'0')

  //Sum of payment claims
  line += claims.reduce((acc, claim) => acc += claim.amount, 0).toString().padStart(17, '0')

  const today = luxon.DateTime.fromJSDate(new Date()).toFormat("ddLLyy")

  //Min day
  line += today

  //Max day
  line += today

  line = line.padEnd(80, '0')
  line += '<br>'
  return line
}

function getStartRecordDeletionRequest() {
  var line =`NY210036`
  line.padEnd(17, '0')
  // Oppdragsnr.
  line += '2'.padStart(7, '0')
  // Accountnr.
  line += '15062995960'
  line = line.padEnd(80, '0')

  line += '<br>'
  return line
}

function getEndRecordDeletionRequest() {
  var line =`NY210036`

  //Number of transactions
  line += '0'.padStart(8,'0')

  //Number of records, including start and end record
  line += '2'.padStart(8,'0')

  //Sum of deletion requests amount
  line += '0'.padStart(17, '0')

  const today = luxon.DateTime.fromJSDate(new Date()).toFormat("ddLLyy")

  //Min day
  line += today

  //Max day
  line += today

  line = line.padEnd(80, '0')
  line += '<br>'
  return line
}

function getEndRecordTransmission(claims) {
  var line =`NY210089`

  //Number of transactions
  line += claims.length.toString().padStart(8,'0')

  //Number of records, including start and end record
  line += (claims.length*2+6).toString().padStart(8,'0')

  //Sum of payment claims
  line += claims.reduce((acc, claim) => acc += claim.amount, 0).toString().padStart(17, '0')

  const today = luxon.DateTime.fromJSDate(new Date()).toFormat("ddLLyy")

  //Min day
  line += today

  //Max day
  line += today

  line = line.padEnd(80, '0')
  line += '<br>'
  return line
}

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
  updateAgreements
}