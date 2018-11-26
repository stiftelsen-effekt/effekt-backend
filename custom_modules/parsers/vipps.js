//const { parse } = require('node-xlsx')
const moment = require('moment')
const KID = require('./../KID.js')
const parse = require('csv-parse/lib/sync')

module.exports = {
  parseReport: function(report) {
    let data = parse(report.toString())

    let currentMinDate = null
    let currentMaxDate = null
    let transactions = data.reduce((acc, dataRow) => {
      let transaction = buildTransactionFromArray(dataRow)
      if(transaction == false) return acc
      if (transaction.date.toDate() < currentMinDate || currentMinDate == null) currentMinDate = transaction.date.toDate()
      if (transaction.date.toDate() > currentMaxDate || currentMaxDate == null) currentMaxDate = transaction.date.toDate()
      acc.push(transaction)
      return acc
    }, [])

    return {
      minDate: currentMinDate,
      maxDate: currentMaxDate,
      transactions: transactions
    }
  },
}

const fieldMapping = {
  SalesDate: 0,
  SalesLocation: 1,
  TransactionID: 4,
  GrossAmount: 6,
  Fee: 7,
  NetAmount: 8,
  TransactionType: 9,
  FirstName: 14,
  LastName: 15,
  Message: 16
}

function buildTransactionFromArray(inputArray) {
  if (inputArray[fieldMapping.TransactionType] !== "Salg") return false
  let transaction = {
    date: moment(inputArray[fieldMapping.SalesDate], "DD.MM.YYYY"),
    location: inputArray[fieldMapping.SalesLocation],
    transactionID: inputArray[fieldMapping.TransactionID],
    amount: Number(inputArray[fieldMapping.GrossAmount]),
    name: inputArray[fieldMapping.FirstName] + " " + inputArray[fieldMapping.LastName],
    message: inputArray[fieldMapping.Message],
    KID: extractKID(inputArray[fieldMapping.Message])
  }

  return transaction
}

function extractKID(inputString) {
  let extractionRegex = /(?=(\d{8}))/
  let attemptedExtraction = extractionRegex.exec(String(inputString))

  if (!attemptedExtraction || attemptedExtraction.length < 2) return null

  attemptedExtraction = attemptedExtraction[1]

  let KIDsubstr = attemptedExtraction.substr(0,7)
  let checkDigit = KID.luhn_caclulate(KIDsubstr)

  if (KIDsubstr + checkDigit.toString() != attemptedExtraction) return null

  return Number(attemptedExtraction)
}