const config = require('../config')
const mail = require('./mail')
const SftpClient = require('ssh2-sftp-client')
const fs = require("fs");

async function writeAvtaleGiroFile(parsedAvtaleGiro) {
  // filename

  // KUNDEENHET-ID
  // Løpenr
  var startRecordTransmission = `NY000010--------'-------'0000808`
  startRecordTransmission.padEnd(80, 0)

  var startRecordAccountingData =`NY210020`
  startRecordAccountingData.padEnd(17, 0)
  startRecordAccountingData += OPPDRAGSNUMMER, OPPDRAGSKONTO
  startRecordAccountingData.padEnd(80, 0)

  parsedAvtaleGiro.foreach(line => {
    
  })
  // make file 


  fs.writeFile('name.txt', 'Simply Easy Learning!', function(err) {
  });
}

module.exports = {
  writeAvtaleGiroFile,
}