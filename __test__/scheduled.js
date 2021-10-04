const sinon = require('sinon');
const chai = require('chai');
const DAO = require('../custom_modules/DAO');

const avtalegiro = require('../custom_modules/avtalegiro')
const mail = require('../custom_modules/mail');
const nets = require('../custom_modules/nets')
const express = require('express')
const bearerToken = require('express-bearer-token')
const scheduledRoute = require('../routes/scheduled')
const request = require('supertest');
const { expect } = require('chai');
const config = require('../config');
const auth = require('../custom_modules/DAO_modules/auth');

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
    server = express()
    server.use(bearerToken())
    server.use('/scheduled', scheduledRoute)

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
      .resolves(mockAgreements)

    loggingStub = sinon
      .stub(DAO.logging, 'add')
      .resolves(true)

    sendFileStub = sinon
      .stub(nets, 'sendFile')

    sendMailBackupStub = sinon
      .stub(mail, 'sendOcrBackup')

    authStub = sinon
      .stub(auth, 'getCheckPermissionByToken')
      .resolves(true)
  })

  beforeEach(function() {
    sinon.resetHistory()
  })

  it('Does nothing with no agreements', async function() {
    agreementsStub.resolves([])

    const response = await request(server)
      .post('/scheduled/avtalegiro')
      .set('Authorization', 'Bearer abc')
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
      .set('Authorization', 'Bearer abc')
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
      .set('Authorization', 'Bearer abc')
      .expect(200)

    config.env = tempEnv

    expect(sendNotificationStub.callCount).to.be.equal(2)
    expect(sendFileStub.calledOnce).to.be.true
  })

  it('Recognizes when claim date is last day of the month', async function() {
    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-25&notify=true')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 0)
  })

  after(function () {
    sinon.reset()
  })
})