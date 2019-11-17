const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');
const expect = (chai.expect);
const mail = require('../custom_modules/mail')
const fs = require('fs');
const config = require('../config')

const paypalroute = require('../routes/reports/paypal')
const vippsRoute = require('../routes/reports/vipps')
const ocrRoute = require('../routes/reports/ocr')

const addStub = sinon
    .stub(DAO.donations, 'add')
    //Returns donation ID
    .resolves(10)

const mailStub = sinon
    .stub(mail, 'sendDonationReciept')

const historicSub = sinon
    .stub(DAO.distributions, 'getHistoricPaypalSubscriptionKIDS')

const parsingRulesStub = sinon
    .stub(DAO.parsing, 'getVippsParsingRules')
    .resolves([])

beforeEach(() => {
    historicSub.reset()
    addStub.reset()
    mailStub.reset()
})

describe('PayPal report route handles correctly', () => {
    it('adds donations to DB when historic matching exists', async () => {
        historicSub.resolves({
            'I-YE66CY1W4DPU': 23
        })

        await runPaypal('Paypal April 2019')

        expect(addStub.callCount).to.be.equal(1)
    })
    
    it('does not fail on 0 historic paypal matches', async() => {
        historicSub.resolves([])

        await runPaypal('Paypal Special')

        expect(addStub.callCount).to.be.equal(0)
    })
})

describe('Vipps route handles report correctly', () => {
    it('Adds donations to DB', async () => {
        await runVipps('Vipps April 2019')
        expect(addStub.callCount).to.be.equal(10)
    })

    it('Attempts to send mail when in production', async () => {
        config.env = "production";
        await runVipps('Vipps April 2019');
        config.env = "development";

        expect(mailStub.callCount).to.be.equal(10);
    })

    it('Adds default donations', async () => {
        parsingRulesStub.resolves([{
            salesLocation: 'Stiftelsen Effekt',
            message: 'Vipps',
            resolveKID: 12345678
        }])

        await runVipps('Vipps April 2019')

        expect(addStub.callCount).to.be.equal(13)
    })
})

/*
describe('OCR route handles correctly', () => {
    it('Adds donations to DB', async () => {
        await runOCR('TBOC2072')

        expect(addStub.callCount).to.be.equal(2)
    })

    it('Sends donation reciept', async () => {
        config.env = "production"
        await runOCR('TBOC2072')
        config.env = "development"

        expect(mailStub.callCount).to.be.equal(2)
    })
})
*/

async function runPaypal(filename) {
    var res = {
        json: () => {}
    }
    const jsonStub = sinon.stub(res, 'json')

    var query = {
        body: {
            metaOwnerID: 3
        },
        files: {
            report: {
                data: readReport('paypal',filename)
            }
        }
    }

    await paypalroute(query, res, (ex) => { throw ex })
}

async function runVipps(filename) {
    let res = {
        json: () => {}
    }

    const jsonStub = sinon
        .stub(res, 'json')

    const query = {
        body: {
            metaOwnerID: 3
        },
        files: {
            report: {
                data: readReport('vipps', filename)
            }
        }
    }

    await vippsRoute(query, res, (ex) => { throw ex })
}

async function runOCR(filename) {
    let res = {
        json: () => {}
    }

    const jsonStub = sinon
        .stub(res, 'json')

    const query = {
        body: {
            metaOwnerID: 3
        },
        files: {
            report: {
                data: readReport('ocr', filename, 'DAT')
            }
        }
    }

    await ocrRoute(query, res, (ex) => { throw ex })
}

function readReport(type, filename, extension = "CSV") {
    return fs.readFileSync(`test/data/${type}/${filename}.${extension}`)
}