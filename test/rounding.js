const chai = require('chai')
const expect = (chai.expect)

const round = require('../custom_modules/rounding.js')

const testCases = [
    [100,100,100,100,100],
    [213,12,98,77,201]
]

describe('round', function() {
    it('toPercent should be a function', function() {
        expect(round.toPercent).to.be.a('function')
    })

    it('toPercent should return an array', function() {
        expect(round.toPercent(testCases[0])).to.be.an('array')
    })

    it('toPercent should return an array of equal length as input', function() {
        expect(round.toPercent(testCases[0])).to.be.length(testCases[0].length)
    })

    it('toPercent should sum to 100', function() {
        for (let i = 0; i < testCases.length; i++) {
            expect(round.toPercent(testCases[i]).reduce((acc, elem) => acc + elem, 0)).to.equal(100)
            expect(round.toPercent(testCases[i],0).reduce((acc, elem) => acc + elem, 0)).to.equal(100)
            expect(round.toPercent(testCases[i],1).reduce((acc, elem) => acc + elem, 0)).to.equal(100)
            expect(round.toPercent(testCases[i],2).reduce((acc, elem) => acc + elem, 0)).to.equal(100)
            expect(round.toPercent(testCases[i],3).reduce((acc, elem) => acc + elem, 0)).to.equal(100)
        }
    })

    it('toPercent with precision should return array with correct amount of decimal places', function() {
        for (let i = 0; i < testCases.length; i++) {
            let test = round.toPercent(testCases[i], 2)

            for (let j = 0; j < test.length; j++) {
                let split = test[j].toString().split('.')
                if (split.length == 2) expect(split[1].length).to.be.lte(2)
            }
        }
    })
})