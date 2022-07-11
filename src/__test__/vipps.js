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
  const mockAgreementsVipps = [{
    ID: "agr_2FDUs6w",
    KID: '002556289731589',
    chargeDay: 10,
    amount: 50000,
    status: "ACTIVE"
  }, {
    ID: "agr_2fh9Huw",
    KID: '000638723319577',
    chargeDay: 0,
    amount: 340000,
    status: "ACTIVE"
  }, {
    ID: "agr_2NfNnTf",
    chargeDay: 1,
    amount: 5000000,
    status: "STOPPED"
  }]

  const mockAgreementsDB = [{
    ID: "agr_2fh9Huw",
    donorID: 973,
    KID: '000638723319577',
    chargeDay: 0,
    amount: 3400,
    status: "ACTIVE"
  }, {
    ID: "agr_2NfNnTf",
    donorID: 973,
    KID: '000675978627833',
    chargeDay: 1,
    amount: 50000,
    status: "STOPPED"
  }]

  const mockChargesVipps = [
    {
      id: "chr-2cXEgFt",
      amount: "5000",
      due: "2022-07-13",
      status: "CHARGED",
      type: "INITIAL"
    },
    {
      id: "chr-",
      amount: "5000",
      due: "2022-07-13",
      status: "PENDING",
      type: "RECURRING"
    },
    {
      id: "chr-",
      amount: "5000",
      due: "2022-07-13",
      status: "CHARGED",
      type: "RECURRING"
    },
    {
      id: "chr-2cXEgFt",
      amount: "5000",
      due: "2022-07-13",
      status: "RESERVED",
      type: "RECURRING"
    }
  ]

  const mockChargesDB = [
    {
      chargeID: "chr-2cXEgFt",
      agreementID: "agr_G2NBhQh",
      KID: "46677414",
      amountNOK: "50",
      due: "2022-07-13",
      status: "CHARGED",
      type: "INITIAL"
    }
  ]
  
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
  let loggingStub

  before(function () {
    authStub = sinon.replace(authMiddleware, "isAdmin", [])

    getAgreementsStub = sinon
      .stub(vipps, 'getAgreements')

    getChargesStub = sinon
      .stub(vipps, 'getCharges')

    getAgreementStub = sinon
      .stub(DAO.vipps, 'getAgreement')

    getActiveAgreementStub = sinon
      .stub(DAO.vipps, 'getActiveAgreements')

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

    loggingStub = sinon
      .stub(DAO.logging, 'add')

    const scheduledRoute = require('../routes/scheduled')
    server = express()
    server.use('/scheduled', scheduledRoute)
  })

  beforeEach(function() {
    sinon.resetHistory()
  })

  it('No agreements test', async function() {
    getAgreementsStub.withArgs("ACTIVE").resolves([])
    getAgreementsStub.withArgs("PENDING").resolves([])
    getAgreementsStub.withArgs("STOPPED").resolves([])
    getAgreementsStub.withArgs("EXPIRED").resolves([])

    const response = await request(server)
      .post('/scheduled/vipps')
      .expect(200)

    expect(true).to.be.true
  })

  it('Synchronize agreements and charges', async function() {
      getAgreementsStub.withArgs("ACTIVE").resolves(mockAgreements)
      getAgreementsStub.withArgs("PENDING").resolves([])
      getAgreementsStub.withArgs("STOPPED").resolves([])
      getAgreementsStub.withArgs("EXPIRED").resolves([])

      const response = await request(server)
      .post('/scheduled/vipps')
      .expect(200)

    expect(true).to.be.true
  })

  after(function () {
    sinon.restore()
  })
})