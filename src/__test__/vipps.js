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
  const daysInAdvance = 3
  const timeNow = new Date().getTime()
  const dueDate = new Date(timeNow + (1000 * 60 * 60 * 24 * daysInAdvance))
  const mockAgreementsVipps = [
    {
      id: "agr_1",
      amount: 50000,
      status: "ACTIVE"
    }, {
      id: "agr_2",
      amount: 340000,
      status: "ACTIVE"
    }, {
      id: "agr_3",
      amount: 5000000,
      status: "STOPPED"
    }
  ]

  const mockAgreementsDB = [
    {
      ID: "agr_1",
      KID: '002556289731589',
      monthly_charge_day: dueDate.getDate(),
      amount: 50000,
      status: "ACTIVE"
    }, {
      ID: "agr_2",
      donorID: 973,
      KID: '000638723319577',
      monthly_charge_day: dueDate.getDate(),
      amount: 3400,
      status: "ACTIVE"
    }, {
      ID: "agr_3",
      donorID: 973,
      KID: '000675978627833',
      monthly_charge_day: dueDate.getDate(),
      amount: 50000,
      status: "STOPPED"
    }
  ]

  const mockChargesVipps = [
    {
      id: "chr-1",
      amount: "5000",
      due: "2022-07-13",
      status: "CHARGED",
      type: "RECURRING"
    },
    {
      id: "chr-2",
      amount: "5000",
      due: "2022-07-13",
      status: "PENDING",
      type: "RECURRING"
    },
    {
      id: "chr-3",
      amount: "5000",
      due: "2022-07-13",
      status: "CHARGED",
      type: "RECURRING"
    }
  ]

  const mockChargesDB = [
    {
      chargeID: "chr-1",
      agreementID: "agr_1",
      KID: "46677414",
      amountNOK: "50",
      due: "2022-07-13",
      status: "CHARGED",
      type: "INITIAL"
    },
    {
      chargeID: "chr-2",
      agreementID: "agr_2",
      amount: "5000",
      due: "2022-07-13",
      status: "PENDING",
      type: "RECURRING"
    },
    {
      chargeID: "chr-3",
      agreementID: "agr_3",
      amount: "5000",
      due: "2022-07-13",
      status: "CHARGED",
      type: "RECURRING"
    },
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
  let updateChargeStatusStub
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

    getVippsAgreementStub = sinon
      .stub(vipps, 'getAgreement')
    
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

    updateChargeStatusStub = sinon
      .stub(DAO.vipps, 'updateChargeStatus')

    externalPaymentIDExistsStub = sinon
      .stub(DAO.donations, 'ExternalPaymentIDExists')

    hasChargedThisMonthStub = sinon
      .stub(vipps, 'hasChargedThisMonth')

    createChargeStub = sinon
      .stub(vipps, 'createCharge')
    
    addDonationStub = sinon
      .stub(DAO.donations, 'add')

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

    getChargesStub.withArgs().resolves([])

    const response = await request(server)
      .post('/scheduled/vipps')
      .expect(200)

    expect(addAgreementStub.called).to.be.false
    expect(addChargeStub.called).to.be.false
    expect(updateAgreementPriceStub.called).to.be.false
    expect(updateAgreementStatusStub.called).to.be.false
    expect(getAgreementStub.called).to.be.false
    expect(getChargesStub.called).to.be.false
    expect(getChargeStub.called).to.be.false
    expect(createChargeStub.called).to.be.false
    expect(loggingStub.calledOnce).to.be.true
    expect(externalPaymentIDExistsStub.called).to.be.false
    expect(addDonationStub.called).to.be.false
  })

  it('Synchronize agreements and charges', async function() {
    getAgreementsStub.withArgs("ACTIVE").resolves(mockAgreementsVipps)
    getAgreementsStub.withArgs("PENDING").resolves([])
    getAgreementsStub.withArgs("STOPPED").resolves([])
    getAgreementsStub.withArgs("EXPIRED").resolves([])

    getChargesStub.withArgs("agr_1").resolves([mockChargesVipps[0]])
    getChargesStub.withArgs("agr_2").resolves([mockChargesVipps[1]])
    getChargesStub.withArgs("agr_3").resolves([mockChargesVipps[2]])

    getAgreementStub.withArgs("agr_1").resolves([mockAgreementsDB[0]])
    getAgreementStub.withArgs("agr_2").resolves([mockAgreementsDB[1]])
    getAgreementStub.withArgs("agr_3").resolves([mockAgreementsDB[2]])

    getChargeStub.withArgs("agr_1", "chr-1").resolves([mockChargesDB[0]])
    getChargeStub.withArgs("agr_2", "chr-2").resolves([mockChargesDB[1]])
    getChargeStub.withArgs("agr_3", "chr-3").resolves([mockChargesDB[2]])

    externalPaymentIDExistsStub.withArgs("agr_1.chr-1").resolves(true)
    externalPaymentIDExistsStub.withArgs("agr_3.chr-3").resolves(false)

    const response = await request(server)
    .post('/scheduled/vipps')
    .expect(200)

    expect(addAgreementStub.callCount).to.be.equal(3)
    expect(addChargeStub.callCount).to.be.equal(3)
    expect(updateAgreementPriceStub.callCount).to.be.equal(3)
    expect(updateAgreementStatusStub.callCount).to.be.equal(3)
    expect(updateChargeStatusStub.callCount).to.be.equal(3)
    expect(getAgreementStub.callCount).to.be.equal(3)
    expect(getChargesStub.callCount).to.be.equal(3)
    expect(getChargeStub.callCount).to.be.equal(2) // Only 2 of the charges has status "CHARGED"
    expect(loggingStub.calledOnce).to.be.true
    expect(externalPaymentIDExistsStub.callCount).to.be.equal(2)
    expect(addDonationStub.calledOnce).to.be.true
  })

  it('Create future due charges', async function() {
    getAgreementsStub.withArgs("ACTIVE").resolves([])
    getAgreementsStub.withArgs("PENDING").resolves([])
    getAgreementsStub.withArgs("STOPPED").resolves([])
    getAgreementsStub.withArgs("EXPIRED").resolves([])

    getActiveAgreementStub.withArgs().resolves([mockAgreementsDB[0], mockAgreementsDB[1]])

    getVippsAgreementStub.withArgs("agr_1").resolves(mockAgreementsVipps[0])
    getVippsAgreementStub.withArgs("agr_2").resolves(mockAgreementsVipps[1])
    
    hasChargedThisMonthStub.withArgs("agr_1").resolves(false)
    hasChargedThisMonthStub.withArgs("agr_2").resolves(true)

    const response = await request(server)
    .post('/scheduled/vipps')
    .expect(200)

    expect(getActiveAgreementStub.calledOnce).to.be.true
    expect(getVippsAgreementStub.callCount).to.be.equal(2)
    expect(hasChargedThisMonthStub.callCount).to.be.equal(2)
    expect(createChargeStub.callCount).to.be.equal(1) // One of the agreements have already been charged this month
    expect(loggingStub.calledOnce).to.be.true
  })

  after(function () {
    sinon.restore()
  })
})