const donorHelper = require('../custom_modules/donorHelper')
const chai = require('chai')
const expect = (chai.expect)

const testDonors = [
    {
        name: 'John Lindås Kongserg Hovmester'
    },
    {
        name: ''
    },
    {
        name: 'Ettnavn'
    },
    {
        name: ' '
    }
]

describe('Donor helper works as expected', () => {
    describe('getFirstname works', () => {
        let firstname = donorHelper.getFirstname(donors[0])
        expect(firstname).to.be.equal("John")

        firstname = donorHelper.getFirstname(donors[1])
        expect(firstname).to.be.equal("")

        firstname = donorHelper.getFirstname(donors[2])
        expect(firstname).to.be.equal("Ettnavn")

        firstname = donorHelper.getFirstname(donors[3])
        expect(firstname).to.be.equal("")
    })
})