// External
const chai = require('chai');
chai.use(require('chai-datetime'))
const expect = (chai.expect);
const fs = require('fs')
const moment = require('moment')

//Custom modules
const paypal = require('../custom_modules/parsers/paypal')
const vipps = require('../custom_modules/parsers/vipps')
const bank = require('../custom_modules/parsers/bank')

const reportType = {
    vipps: "vipps",
    paypal: "paypal"
}

describe("Paypal CSV", () => {
    it("Parses paypal CSV with comma seperation and \"", () => {
        const sample = readCSV(reportType.paypal, "Paypal April 2019")

        let transactions = paypal.parse(sample)
        expect(transactions).to.be.length(9)
    })

    it("Parses paypal CSV with semicolon seperation and \"", () => {
        const sample = readCSV(reportType.paypal, "Paypal April 2019 - Semicolon")

        let transactions = paypal.parse(sample)
        expect(transactions).to.be.length(9)
    })

    it("Parses paypal CSV with semicolon seperation and without \"", () => {
        const sample = readCSV(reportType.paypal, "Paypal April 2019 - Semicolon Stripped")

        let transactions = paypal.parse(sample)
        expect(transactions).to.be.length(9)
    })

    it("Parses paypal CSV with semicolon seperation and without \" with . comma seperator", () => {
        const sample = readCSV(reportType.paypal, "Paypal April 2019 - Semicolon Stripped Dot")

        let transactions = paypal.parse(sample)
        expect(transactions).to.be.length(9)
    })

    it("Parses problematic paypal CSV for september", () => {
        const sample = readCSV(reportType.paypal, "Paypal Special")

        let transactions = paypal.parse(sample)
        expect(transactions).to.be.length(6)
    })

    it("Parses problematic paypal CSV for october", () => {
        const sample = readCSV(reportType.paypal, "Effekt PayPal oktober")

        let transactions = paypal.parse(sample)
        expect(transactions).to.be.length(2)
    })
})

describe("Vipps CSV", () => {
    it("Parses vipps CSV with semicolon seperation", () => {
        const sample = readCSV(reportType.vipps, "Vipps April 2019")

        let transactions = vipps.parseReport(sample).transactions
        expect(transactions).to.be.length(15)
    })
})

describe("Bank CSV", () => {
    it("Parses bank report correctly when downloaded from google drive", () => {
        let transactions = bank.parseReport(readCSV("bank", "sampleReport"))

        expect(transactions[0].KID).to.be.equal(57967549)
        expect(transactions[6].date.isSame(moment("02.01.2019", "DD.MM.YYYY"))).to.be.equal(true)
        expect(transactions[2].amount).to.be.equal(250)
        expect(transactions[4].transactionID).to.be.equal("1264")
    })
})

function readCSV(type, filename) {
    return fs.readFileSync(`test/data/${type}/${filename}.CSV`)
}