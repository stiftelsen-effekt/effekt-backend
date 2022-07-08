const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');

const vipps = require('../custom_modules/vipps')
const mail = require('../custom_modules/mail');
const nets = require('../custom_modules/nets')
const express = require('express')
const request = require('supertest');
const { expect } = require('chai');
const config = require('../config');
const authMiddleware = require('../custom_modules/authorization/authMiddleware');

describe('POST /scheduled/vipps', function() {
  const mockAgreements = [{
    id: 1,
    KID: '002556289731589',
    chargeDay: 10,
    amount: 50000,
    status: "ACTIVE"
  }, {
    id: 2,
    KID: '000638723319577',
    chargeDay: 0,
    amount: 340000,
    status: "ACTIVE"
  }, {
    id: 3,
    KID: '000675978627833',
    chargeDay: 1,
    amount: 5000000,
    status: "ACTIVE"
  }]
  
  let server

  let authStub
  let getAgreementsStub
  let getChargesStub
  let getAgreementStub
  let addAgreementStub
  let updateAgreementPriceStub
  let updateAgreementStatusStub
  let addChargeStub
  let getChargeStub
  let externalPaymentIDExistsStub
  let hasChargedThisMonthStub
  let createChargeStub

  before(function () {
    authStub = sinon.replace(authMiddleware, "isAdmin", [])

    getAgreementsStub = sinon
      .stub(vipps, 'getAgreements')

    getChargesStub = sinon
      .stub(vipps, 'getCharges')

    getAgreementStub = sinon
      .stub(DAO.vipps, 'getAgreement')

    addAgreementStub = sinon
      .stub(DAO.vipps, 'addAgreement')

    updateAgreementPriceStub = sinon
      .stub(DAO.vipps, 'updateAgreementPrice')

    updateAgreementStatusStub = sinon
      .stub(DAO.vipps, 'updateAgreementStatus')

    addChargeStub = sinon
      .stub(DAO.vipps, 'addCharge')

    getChargeStub = sinon
      .stub(DAO.vipps, 'getCharge')

    externalPaymentIDExistsStub = sinon
      .stub(DAO.donations, 'ExternalPaymentIDExists')

    hasChargedThisMonthStub = sinon
      .stub(vipps, 'hasChargedThisMonth')

    createChargeStub = sinon
      .stub(vipps, 'createCharge')
    
    getAgreementsStub.withArgs("ACTIVE").resolves(mockAgreements)
    getAgreementsStub.withArgs("PENDING").resolves(mockAgreements)
    getAgreementsStub.withArgs("STOPPED").resolves(mockAgreements)
    getAgreementsStub.withArgs("EXPIRED").resolves([])

    const scheduledRoute = require('../routes/scheduled')
    server = express()
    server.use('/scheduled', scheduledRoute)
  })

  beforeEach(function() {
    sinon.resetHistory()
  })

  it('Basic test', async function() {

    const response = await request(server)
      .post('/scheduled/vipps?date=2021-10-03')
      .expect(200)

    expect(true).to.be.true
  })

  after(function () {
    sinon.restore()
  })
})