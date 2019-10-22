const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');
const expect = (chai.expect);
const mail = require('../custom_modules/mail')
const fs = require('fs');

const paypalroute = require('../routes/reports/paypal')
const vippsRoute = require('../routes/reports/vipps')

const HistoricMapping = {
    'I-YE66CY1W4DPU': 23
}

const addStub = sinon
    .stub(DAO.donations, 'add')
    //Returns donation ID
    .resolves(10)

const mailStub = sinon
    .stub(mail, 'sendDonationReciept')

const historicSub = sinon
    .stub(DAO.distributions, 'getHistoricPaypalSubscriptionKIDS')
    .resolves(HistoricMapping)

const parsingRulesStub = sinon
    .stub(DAO.parsing, 'getVippsParsingRules')
    .resolves([])

beforeEach(() => {
    addStub.reset()
})

describe('PayPal report route handles correctly', () => {
    it('adds donations to DB', async () => {
        await runPaypal('Paypal April 2019')

        expect(addStub.callCount).to.be.equal(1)
    })
    
})

describe('Vipps route handles report correctly', () => {
    it('Adds donations to DB', async () => {
        await runVipps('Vipps April 2019')

        expect(addStub.callCount).to.be.equal(10)
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

async function runPaypal(filename) {
    var res = {
        json: () => {}
    }
    const jsonStub = sinon.stub(res, 'json')

    var query = {
        files: {
            report: {
                data: readCSV('paypal',filename)
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
        files: {
            report: {
                data: readCSV('vipps', filename)
            }
        }
    }

    await vippsRoute(query, res, (ex) => { throw ex })
}

function readCSV(type, filename) {
    return fs.readFileSync(`test/data/${type}/${filename}.csv`)
}