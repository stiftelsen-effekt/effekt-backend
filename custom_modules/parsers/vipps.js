const { parse } = require('node-xlsx')
const KID = require('./../KID.js')

const HEADER_ROW = 7;
const VIPPS_ID = 4
const NUMBER_FIELDS = ['transactionId', 'amount']
const FIELD_MAPPING = {
  Salgsdato : 'date',
  Salgssted : 'location',
  Fornavn : 'firstName',
  Etternavn : 'lastName',
  'Transaksjons-ID': 'transactionId',
  Brutto: 'amount',
  Melding : 'message',
  Salg : 'amount',
  Status : 'status'
}

module.exports = {
  parseReport: function(report) {
    const [{ data }] = parse(report, { raw: false });
    const header = data[HEADER_ROW];
    const rows = data.slice(HEADER_ROW + 1, data.length - 1)
    const transactions = rows.map((row) => {
        const properties = {};
          row.forEach((field, index) => {
            const key = FIELD_MAPPING[header[index]];
            if (!key) {
              return;
            }

            if (NUMBER_FIELDS.includes(key)) {
              properties[key] = Number(field);
            } else {
              properties[key] = field;
            }
          });

          //Attempt to extract KID
          try {
            let extractionRegex = /(?=(\d{8}))/
            let attemptedExtraction = extractionRegex.exec(String(properties.message));

            if (!attemptedExtraction || attemptedExtraction.length < 2) throw "Could not extract numeric sequence";

            attemptedExtraction = attemptedExtraction[1];

            let KIDsubstr = attemptedExtraction.substr(0,7);
            let checkDigit = KID.luhn_caclulate(KIDsubstr)

            if (KIDsubstr + checkDigit.toString() != attemptedExtraction) throw "Numeric sequence extracted is not valid KID";

            properties.KID = Number(attemptedExtraction);
            properties.valid = true;
          } catch(ex) {
            //console.log(ex)
            properties.valid = false;
          }
        return properties
      }).filter((transaction) => (transaction.date && transaction.date != "Til utbetaling netto"));

      return transactions
    }
}
