const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');
const request = require('request-promise-native')
const expect = (chai.expect);
const mailchimp = require('../custom_modules/mailchimp')

const requestStub = sinon
    .stub(request, 'post')
    //Returns OK from the API
    .resolves({
        status: 200,
        content: "A OK"
    })

const getDnonorStub = sinon
    .stub(DAO.donors, 'getByID')
    .resolves({

    })

beforeEach(() => {
    requestStub.reset()
    addStub.reset()
    mailStub.reset()
})

describe('', () => {
    it('Sens a request to mailchimp api when subscribe called with correct parameters', async () => {
        requestStub.resolves({
            'I-YE66CY1W4DPU': 23
        })

        let result = await mailchimp.subscribeDonor(99)


        expect(result).to.be.true()
    })

    it('Handles no donor found nicely', async () => {


        let result = await mailchimp.subscribeDonor(99)

        expect(result).to.be.false()
    })

    it('Handles error from api gracefuly', async () => {
        let result = await mailchimp.subscribeDonor(99)

        expect(result).to.be.false()
    })
})
