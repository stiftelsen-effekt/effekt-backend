// External
const chai = require('chai');
chai.use(require('chai-datetime'))
const expect = (chai.expect);
const fs = require('fs')

//Custom modules
const paypal = require('../custom_modules/parsers/paypal.js')
const vipps = require('../custom_modules/parsers/vipps.js')

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
})

describe("Vipps CSV", () => {
    it("Parses vipps CSV with semicolon seperation", () => {
        const sample = readCSV(reportType.vipps, "Vipps April 2019")

        let transactions = vipps.parseReport(sample).transactions
        expect(transactions).to.be.length(15)
    })
})

function readCSV(type, filename) {
    return fs.readFileSync(`test/data/${type}/${filename}.CSV`)
}