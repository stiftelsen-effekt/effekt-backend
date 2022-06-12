const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');

const avtalegiro = require('../custom_modules/avtalegiro')
const mail = require('../custom_modules/mail');
const nets = require('../custom_modules/nets')
const express = require('express')
const request = require('supertest');
const { expect } = require('chai');
const config = require('../config');
const authMiddleware = require('../custom_modules/authorization/authMiddleware')

describe('POST /scheduled/avtalegiro', function() {
  const mockAgreements = [{
    id: 1,
    KID: '002556289731589',
    claimDate: 10,
    amount: 50000,
    notice: true,
    active: true
  }, {
    id: 2,
    KID: '000638723319577',
    claimDate: 10,
    amount: 340000,
    notice: false,
    active: true
  }, {
    id: 3,
    KID: '000675978627833',
    claimDate: 10,
    amount: 5000000,
    notice: true,
    active: true
  }]
  
  let server

  let avtalegiroFileStub
  let sendNotificationStub
  let shipmentStub
  let agreementsStub
  let loggingStub 
  let sendFileStub
  let sendMailBackupStub
  let authStub

  before(function () {
    avtalegiroFileStub = sinon
      .stub(avtalegiro, 'generateAvtaleGiroFile')
      .resolves(Buffer.from('', 'utf-8'))

    sendNotificationStub = sinon
      .stub(mail, 'sendAvtalegiroNotification')
      .resolves(true)

    shipmentStub = sinon
      .stub(DAO.avtalegiroagreements, 'addShipment')
      .resolves(42)

    agreementsStub = sinon
      .stub(DAO.avtalegiroagreements, 'getByPaymentDate')
    
    agreementsStub.withArgs(10).resolves(mockAgreements)
    agreementsStub.withArgs(28).resolves(mockAgreements)
    agreementsStub.withArgs(31).resolves([])

    loggingStub = sinon
      .stub(DAO.logging, 'add')
      .resolves(true)

    sendFileStub = sinon
      .stub(nets, 'sendFile')

    sendMailBackupStub = sinon
      .stub(mail, 'sendOcrBackup')

    authStub = sinon
      .stub(authMiddleware, 'auth')
      .returns([])

    const scheduledRoute = require('../routes/scheduled')
    server = express()
    server.use('/scheduled', scheduledRoute)
  })

  beforeEach(function() {
    sinon.resetHistory()
  })

  it('Does nothing with no agreements', async function() {
    agreementsStub.resolves([])

    const response = await request(server)
      .post('/scheduled/avtalegiro')
      .expect(200)

    expect(agreementsStub.calledOnce).to.be.true
    expect(sendNotificationStub.called).to.be.false
    expect(sendFileStub.called).to.be.false
    expect(loggingStub.calledOnce).to.be.true
    expect(sendMailBackupStub.calledOnce).to.be.true
  })

  it('Generates claim file when provided a date', async function() {
    agreementsStub.resolves(mockAgreements)

    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-04')
      .expect(200)

    expect(sendNotificationStub.called).to.be.false
    expect(sendFileStub.calledOnce).to.be.true
  })

  it('Notifies claimants when they have asked for it', async function() {
    agreementsStub.resolves(mockAgreements)

    // Used to force mail to be sent (but method is stubbed)
    let tempEnv = config.env
    config.env = 'production'

    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-04&notify=true')
      .expect(200)

    config.env = tempEnv

    expect(sendNotificationStub.callCount).to.be.equal(2)
    expect(sendFileStub.calledOnce).to.be.true
  })

  it('Recognizes when claim date is last day of the month', async function() {
    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-25&notify=true')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 0)
    sinon.assert.calledWithExactly(shipmentStub, mockAgreements.length)
  })

  it('Includes the 28th when the 28th is last day of month', async function() {
    const respnse = await request(server)
      .post('/scheduled/avtalegiro/?date=2022-02-22&notify=true')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 0)
    sinon.assert.calledWithExactly(agreementsStub, 28)
    // Should have 2x mock agreements, one x for the last of the month, one x for the 28th
    sinon.assert.calledWithExactly(shipmentStub, mockAgreements.length*2)
  })

  after(function () {
    sinon.reset()
  })
})