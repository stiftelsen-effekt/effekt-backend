const chai = require('chai')
const crypto = require('../custom_modules/crypto.js')
const expect = (chai.expect)

describe('auth', function() {
    describe('getPasswordResetKey', function() {
        it('should be a function', function() {
            expect(crypto.getPasswordResetKey).to.be.a('function')
        })

        it('should return a string', function() {
            expect(crypto.getPasswordResetKey()).to.be.a('string')
        })

        it('should return a string of length 40', function() {
            expect(crypto.getPasswordResetKey().length).to.be.equal(40)
        })

        it('should not return the same when called consecutively', function() {
            expect(crypto.getPasswordResetKey() == crypto.getPasswordResetKey()).to.be.equal(false)
        })
    });

    describe('getPasswordSalt', function() {
        it('should be a function', function() {
            expect(crypto.getPasswordSalt).to.be.a('function')
        })

        it('should return a string', function() {
            expect(crypto.getPasswordSalt()).to.be.a('string')
        })

        it('should return a string of length 32', function() {
            expect(crypto.getPasswordSalt().length).to.be.equal(32)
        })

        it('should not return the same when called consecutively', function() {
            expect(crypto.getPasswordSalt() == crypto.getPasswordSalt()).to.be.equal(false)
        })
    });


    describe('hashPassword', function() {
        let samplePwd = "SomeSamplePassword";
        let sampleSalt = "ak3s7h28asf";

        it('should be a function', function() {
            expect(crypto.hashPassword).to.be.a('function')
        })

        let hashedPwd = crypto.hashPassword(samplePwd, sampleSalt);
        it('should return a string', function() {
            expect(hashedPwd).to.be.a('string')
        })

        it('should return a string of length 64', function() {
            expect(hashedPwd.length).to.be.equal(64)
        })

        it('should return the same when equal paramaters passed', function() {
            expect(crypto.hashPassword(samplePwd, sampleSalt) == crypto.hashPassword(samplePwd, sampleSalt)).to.be.equal(true)
        })

        it('should not return the same when different paramaters passed', function() {
            expect(crypto.hashPassword(samplePwd, sampleSalt) == crypto.hashPassword(samplePwd, "o8yb5sia90")).to.be.equal(false)
        })
    })
})