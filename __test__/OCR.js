// External
const chai = require('chai');
chai.use(require('chai-datetime'))
const expect = (chai.expect);
const fs = require('fs')

// Internal
const OCR = require('../custom_modules/parsers/OCR.js');

const sampleOCRfile = fs.readFileSync('__test__/data/ocr_test.ocr').toString("utf8")
const noTransactionOCRFile =  fs.readFileSync('__test__/data/ocr_no_valid_records.ocr').toString("utf8")
const sampleOCRline =               "NY091330000000022011700000000000000000000000100000000000000000000012345678000000"
const sampleOCRnextliner =          "NY091331000000800003233427974208710000000061119150623218380000000000000000000000"

// Tests for Generate() in KID.js
describe('OCR', function() {
    describe('OCR parse', function() {
        it('parse should be a function', function() {
            expect(OCR.parse).to.be.a('function');
        });

        it('parse should return an array', function() {
            expect(OCR.parse(sampleOCRfile)).to.be.a('array');
        });

        it('when no interesting transaction in file, should return empty array', function() {
            expect(OCR.parse(noTransactionOCRFile).length).to.equal(0);
        })
    });

    describe('Parses sample OCR file', () => {
        it('Parses sample file correctly', async () => {
            let filecontents = fs.readFileSync('./__test__/data/ocr/TBOC2072.DAT').toString("utf8")
            let transactions = OCR.parse(filecontents)

            expect(transactions.length).to.be.equal(2)
            expect(transactions[0].KID).to.be.equal(47914510)
            expect(transactions[0].amount).to.be.equal(5000.49)
        })
    })
})