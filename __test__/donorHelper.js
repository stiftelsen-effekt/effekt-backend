const donorHelper = require('../custom_modules/donorHelper')
const chai = require('chai')
const expect = (chai.expect)

const donors = [
    {
        name: 'John Lindås Kongserg Hovmester'
    },
    {
        name: '' //Empty string
    },
    {
        name: 'Karsten'
    },
    {
        name: ' ' //A space
    }
]

describe('Donor helper works as expected', () => {
    describe('getFirstname works', () => {
        let firstname = donorHelper.getFirstname(donors[0])
        expect(firstname).to.be.equal("John")

        firstname = donorHelper.getFirstname(donors[1])
        expect(firstname).to.be.equal("")

        firstname = donorHelper.getFirstname(donors[2])
        expect(firstname).to.be.equal("Karsten")

        firstname = donorHelper.getFirstname(donors[3])
        expect(firstname).to.be.equal("")
    })

    describe('getLastname works', () => {
        let lastname = donorHelper.getLastname(donors[0])
        expect(lastname).to.be.equal("Lindås Kongserg Hovmester")

        lastname = donorHelper.getLastname(donors[1])
        expect(lastname).to.be.equal("")

        lastname = donorHelper.getLastname(donors[2])
        expect(lastname).to.be.equal("")

        lastname = donorHelper.getLastname(donors[3])
        expect(lastname).to.be.equal("")
    })
})