const chai = require('chai')
const expect = (chai.expect)

const round = require('../custom_modules/rounding.js')

describe('round', function() {
    describe('sumWithPrecision', function() {
        const testCases = [
            [50, 50],
            [10, 12, 14, 16, 18, 20, 10],
            [0.002, 99.998],
            [33.33333333, 33.33333333, 33.33333334],
            [21.2, 12.4, 8.7, 9.326, 8.1, 12.7863144, 8, 10, 9.4876856],
            [100],
            [0,0,0,100]
        ]

        it('should be a functoin', function() {
            expect(round.sumWithPrecision).to.be.a('function')
        })

        it('should return a number', function() {
            expect(round.sumWithPrecision([50,50])).to.be.a('number')
        })

        it('should return 100 when supplied with array that totals 100', function() {
            for(let i = 0; i < testCases.length; i++) {
                expect(round.sumWithPrecision(testCases[i])).to.equal(100)
            }
        })
    })

    describe('toPercent' , function() {
        const testCases = [
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
            expect(round.toPercent(testCases[0])).to.be.an('array')
        })

        it('should return an array of equal length as input', function() {
            expect(round.toPercent(testCases[0])).to.be.length(testCases[0].length)
        })

        it('should sum to 100', function() {
            for (let i = 0; i < testCases.length; i++) {
                expect(round.sumWithPrecision(round.toPercent(testCases[i]))).to.equal(100)
                expect(round.sumWithPrecision(round.toPercent(testCases[i],0))).to.equal(100)
                expect(round.sumWithPrecision(round.toPercent(testCases[i],1))).to.equal(100)
                expect(round.sumWithPrecision(round.toPercent(testCases[i],2))).to.equal(100)
                expect(round.sumWithPrecision(round.toPercent(testCases[i],3))).to.equal(100)
            }
        })

        it('should return array with correct amount of decimal places when precision argument passed', function() {
            for (let i = 0; i < testCases.length; i++) {
                let test = round.toPercent(testCases[i], 2)

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
                expect(round.sumWithPrecision(round.toAbsolute(testCases[i].total, testCases[i].spread))).to.equal(testCases[i].total)
            }
        })
    })
})