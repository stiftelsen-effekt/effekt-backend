const { parse } = require('node-xlsx');
const { kidnumber } = require('./KID.js');
const validator = require('no-data-validator');
const DAO = require('./DAO.js')
const Promise = require('bluebird');

const HEADER_ROW = 6;
const VIPPS_ID = 4
const NUMBER_FIELDS = ['transactionId', 'amount']
const FIELD_MAPPING = {
  Salgsdato : 'date',
  Salgssted : 'location',
  Fornavn : 'firstName',
  Etternavn : 'lastName',
  TransaksjonsID : 'transactionId',
  Melding : 'message',
  Salg : 'amount',
  Status : 'status'
}

module.exports = {
  parse_report: function(report) {
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
          properties.kidNumber = String(properties.message).replace(/[^0-9]/g, '');
          properties.valid = validator.kidNumber(properties.kidNumber)
        return properties
      });

      return transactions
    }
}
