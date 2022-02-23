const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');
const request = require('request-promise-native')
const expect = (chai.expect);
const mailchimp = require('../custom_modules/mailchimp')

describe('Mailchimp tests', () => {
    let requestStub
    let getDonorStub 
    
    before(function() {
        requestStub = sinon
            .stub(request, 'post')
            //Returns OK from the API
            .resolves({
                status: 200,
                content: "A OK"
            })

        getDonorStub = sinon
            .stub(DAO.donors, 'getByID')
    })

    beforeEach(function() {
        sinon.resetHistory()
    })

    it('Sens a request to mailchimp api when subscribe called with correct parameters', async () => {
        getDonorStub.resolves({
            id: 20,
            name: "Some Name"
        })
        
        requestStub.resolves({
            data: {
                subscribed: true
            }
        })

        let result = await mailchimp.subscribeDonor(20)
        
        expect(result).to.be.equal(true)
    })

    after(function() {
        DAO.donors.getByID.restore();
    });
})

