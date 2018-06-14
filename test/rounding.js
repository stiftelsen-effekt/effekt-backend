const chai = require('chai')
const expect = (chai.expect)

const round = require('../custom_modules/rounding.js')
console.log(round)

describe('round', function() {
    describe('sumWithPrecision', function() {
        const positiveTestCases = [
            [50, 50],
            [10, 12, 14, 16, 18, 20, 10],
            [0.002, 99.998],
            [33.33333333, 33.33333333, 33.33333334],
            [21.2, 12.4, 8.7, 9.326, 8.1, 12.7863144, 8, 10, 9.4876856],
            [100],
            [0,0,0,100]
        ]

        const negativeTestCases = [
            [10,20],
            [99.99998, 0.00001],
            [2,2,2,2,1,90],
            [6.6000000000000005, 6.6000000000000005, 6.6000000000000005, 80, 0.2, 0, 0]
        ]

        it('should be a function', function() {
            expect(round.sumWithPrecision).to.be.a('function')
        })

        it('should return a string', function() {
            expect(round.sumWithPrecision([50,50])).to.be.a('string')
        })

        it('should return 100 when supplied with array that totals 100', function() {
            for(let i = 0; i < positiveTestCases.length; i++) {
                let res = round.sumWithPrecision(positiveTestCases[i])
                expect(res).to.equal('100')
            }
        })

        it('should not return 100 when supplied with array that does not total 100', function() {
            for(let i = 0; i < negativeTestCases.length; i++) {
                expect(round.sumWithPrecision(negativeTestCases[i]).toString()).to.not.equal('100')
            }
        })
    })

    describe('toPercent' , function() {
        const testCases = [
            [250,250,0,0,0,0,0,0],
            [100,100,100,100,100],
            [213,12,98,77,201],
            [2,1],
            [1034, 276, 3, 96, 4, 546, 34, 893, 1000],
            [333, 333, 334]
        ]

        it('should be a function', function() {
            expect(round.toPercent).to.be.a('function')
        })

        it('should return an array', function() {
            expect(round.toPercent(testCases[0], round.sumWithPrecision(testCases[0]), 0)).to.be.an('array')
        })

        it('should return an array of equal length as input', function() {
            expect(round.toPercent(testCases[0], round.sumWithPrecision(testCases[0]), 0)).to.be.length(testCases[0].length)
        })

        it ('should sum to total', function() {
            expect(round.sumWithPrecision(round.toPercent([10,0,90], 200)).toString()).to.equal('50')
        })

        it('should sum to 100', function() {
            for (let i = 0; i < testCases.length; i++) {
                expect(round.sumWithPrecision(round.toPercent(testCases[i], round.sumWithPrecision(testCases[i]), 0))).to.equal('100')
                expect(round.sumWithPrecision(round.toPercent(testCases[i], round.sumWithPrecision(testCases[i]), 1))).to.equal('100')
                expect(round.sumWithPrecision(round.toPercent(testCases[i], round.sumWithPrecision(testCases[i]), 2))).to.equal('100')
                expect(round.sumWithPrecision(round.toPercent(testCases[i], round.sumWithPrecision(testCases[i]), 3))).to.equal('100')
            }
        })

        it('should return array with correct amount of decimal places when precision argument passed', function() {
            for (let i = 0; i < testCases.length; i++) {
                let test = round.toPercent(testCases[i], round.sumWithPrecision(testCases[i]), 2)

                for (let j = 0; j < test.length; j++) {
                    let split = test[j].toString().split('.')
                    if (split.length == 2) expect(split[1].length).to.be.lte(2)
                }
            }
        })
    })
    
    describe('toAbsolute', function() {
        const testCases = [
            { total: 10.0, spread: [50, 50] },
            { total: 250, spread: [10, 12, 14, 16, 18, 20, 10] },
            { total: 210, spread: [0.002, 99.998] },
            { total: 1230, spread: [21.2, 12.4, 8.7, 9.326, 8.1, 12.7863144, 8, 10, 9.4876856] },
            { total: 150, spread: [33.33333333, 33.33333333, 33.33333334] },
            { total: 23, spread: [33.33333333, 33.33333333, 33.33333334] },
            { total: 137, spread: [100] }
        ]

        it('should be a function', function() {
            expect(round.toAbsolute).to.be.a('function')
        })

        it('should return an array', function() {
            expect(round.toAbsolute(testCases[0].total, testCases[0].spread)).to.be.an('array')
        })

        it('should return an array of equal length as input', function() {
            for(let i = 0; i < testCases.length; i++) {
                expect(round.toAbsolute(testCases[i].total, testCases[i].spread).length).to.equal(testCases[i].spread.length)
            }
        })

        it('should sum to total', function() {
            for(let i = 0; i < testCases.length; i++) {
                expect(round.sumWithPrecision(round.toAbsolute(testCases[i].total, testCases[i].spread))).to.equal(testCases[i].total.toString())
            }
        })
    })
})