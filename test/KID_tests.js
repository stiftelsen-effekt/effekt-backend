
// External
const chai = require('chai');
const expect = (chai.expect);

// Internal
const KID = require('../custom_modules/KID.js');

// http://www.paypalobjects.com/en_US/vhelp/paypalmanager_help/credit_card_numbers.htm
// Luhn algorithm/MOD10 is used to validate credit card numbers also, so testing the function(s) against some credit card numbers seems like a good idea.
var TestCardNumbers = [ 378282246310005, 371449635398431, 5610591081018250, 30569309025904, 38520000023237, 6011111111111117, 
						6011000990139424, 3530111333300000, 3566002020360505, 5555555555554444, 5105105105105100, 4111111111111111, 
						4012888888881881, 4222222222222, 5019717010103742, 6331101999990016];

describe('KID module', function() {
	// Tests for Generate() in KID.js
	describe('KidGenerate', function() {
		it('generate should be a function', function() {
			expect(KID.generate).to.be.a('function');
		});

		it('generate should return a string', function() {
			expect(KID.generate()).to.be.a('number');
		});

		// Numbers based on data from wiki https://no.wikipedia.org/wiki/KID-nummer
		it('generate should return a string with logical length', function() {
			expect(KID.generate().length == 8);
		});
		
	});

	// Tests for luhn_checksum() in KID.js
	describe('luhn_checksum', function() {
		it('luhn_checksum should be a function', function() {
			expect(KID.luhn_checksum).to.be.a('function');
		});

		it('luhn_checksum should return a number', function() {
			expect(KID.luhn_checksum(1)).to.be.a('number');
		});
		
		it('luhn_checksum multi-number check', function() {
			for(var x = 0; x < TestCardNumbers.length; x++){
				expect((KID.luhn_checksum(TestCardNumbers[x]))).equal(0);
				expect((KID.luhn_checksum(TestCardNumbers[x]))).to.be.a('number');
			}
		});
	});

	// Tests for luhn_caclulate() in KID.js
	describe('luhn_caclulate', function() {
		it('luhn_caclulate should be a function', function() {
			expect(KID.luhn_caclulate).to.be.a('function');
		});

		it('luhn_caclulate should return a number', function() {
			expect(KID.luhn_caclulate(1)).to.be.a('number');
		});
		
		it('luhn_caclulate multi-number check', function() {
			for(var x = 0; x < TestCardNumbers.length; x++){
				var CurrentNumber = TestCardNumbers[x].toString();
				var ValidationNumber = parseInt(CurrentNumber[CurrentNumber.length-1]);
				var CaluclationNumber = parseInt(CurrentNumber.slice(0,-1));
				expect(KID.luhn_caclulate(CaluclationNumber)).equal(ValidationNumber);
				expect(KID.luhn_caclulate(CaluclationNumber)).to.be.a('number');
			}
		});
	});
})
