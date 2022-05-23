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
const luxon = require('luxon')

describe('POST /scheduled/avtalegiro', function () {
  const mockAgreementsOn10 = [{
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

  const mockAgreementsOn28 = [{
    id: 4,
    KID: '002556289731590',
    claimDate: 28,
    amount: 50001,
    notice: true,
    active: true
  }, {
    id: 5,
    KID: '000638723319580',
    claimDate: 28,
    amount: 340001,
    notice: false,
    active: true
  }]

  const mockAgreementsOnLastDay = [{
    id: 6,
    KID: '002556289731900',
    claimDate: 0,
    amount: 50000,
    notice: true,
    active: true
  }, {
    id: 7,
    KID: '000638723319400',
    claimDate: 0,
    amount: 340000,
    notice: false,
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

  oldDefaultZone = luxon.Settings.defaultZone
  oldNow = luxon.Settings.now

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

  afterEach(function () {
    luxon.Settings.defaultZone = oldDefaultZone
    luxon.Settings.now = oldNow

    sinon.resetHistory()
  })

  it('Does nothing with no agreements', async function () {
    agreementsStub.resolves([])

    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-01')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 7)  // 1st + 6 days
    expect(agreementsStub.calledOnce).to.be.true
    expect(sendNotificationStub.called).to.be.false
    expect(sendFileStub.called).to.be.false
    expect(loggingStub.calledOnce).to.be.true
    expect(sendMailBackupStub.calledOnce).to.be.true
  })

  it('Uses current date in Europe/Oslo time, when system in different timezone', async function () {
    agreementsStub.resolves([])

    luxon.Settings.defaultZone = 'America/Los_Angeles'
    // This is 2022-05-12 20:00 in Los Angeles.
    // At the same time instant, it is 2022-05-13 in Oslo.
    // Even when system time in America/Los_Angeles timezone, use Oslo date
    mockTime = luxon.DateTime.local(2022, 05, 12, 20, { zone: 'America/Los_Angeles' }).toMillis()
    luxon.Settings.now = () => mockTime

    await request(server)
      .post('/scheduled/avtalegiro')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 19)  // 13th + 6 days

    luxon.Settings.defaultZone = 'Asia/Tokyo'
    // This is 2022-05-14 04:00 in Tokyo.
    // At the same time instant, it is 2022-05-13 in Oslo.
    // Even when system time in Asia/Tokyo timezone, use Oslo date
    mockTime = luxon.DateTime.local(2022, 05, 14, 04, { zone: 'Asia/Tokyo' }).toMillis()
    luxon.Settings.now = () => mockTime

    await request(server)
      .post('/scheduled/avtalegiro')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 19)  // 13th + 6 days
  })

  it('Generates claim file when provided a date', async function () {
    agreementsStub.withArgs(10).resolves(mockAgreementsOn10)

    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-04')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWithExactly(agreementsStub, 10)  // 4th + 6 days
    expect(sendNotificationStub.called).to.be.false
    expect(sendFileStub.calledOnce).to.be.true
  })

  it('Notifies claimants when they have asked for it', async function () {
    agreementsStub.withArgs(10).resolves(mockAgreementsOn10)

    // Used to force mail to be sent (but method is stubbed)
    let tempEnv = config.env
    config.env = 'production'

    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-04&notify=true')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    config.env = tempEnv

    sinon.assert.calledWithExactly(agreementsStub, 10)  // 4th + 6 days
    expect(sendNotificationStub.callCount).to.be.equal(2)
    expect(sendFileStub.calledOnce).to.be.true
  })

  it('Recognizes when claim date is last day of the month', async function () {
    agreementsStub.withArgs(31).resolves([])
    agreementsStub.withArgs(0).resolves(mockAgreementsOnLastDay)

    const response = await request(server)
      .post('/scheduled/avtalegiro/?date=2021-10-25&notify=true')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWith(agreementsStub, 31)  // 25th + 6 days
    sinon.assert.calledWith(agreementsStub, 0)
    sinon.assert.calledWithExactly(shipmentStub, mockAgreementsOnLastDay.length)
  })

  it('Includes the 28th when the 28th is last day of month', async function () {
    agreementsStub.withArgs(28).resolves(mockAgreementsOn28)
    agreementsStub.withArgs(0).resolves(mockAgreementsOnLastDay)

    const respnse = await request(server)
      .post('/scheduled/avtalegiro/?date=2022-02-22&notify=true')
      .set('Authorization', 'Bearer abc')
      .expect(200)

    sinon.assert.calledWith(agreementsStub, 28)   // 22nd + 6 days
    sinon.assert.calledWith(agreementsStub, 0)
    // Should have 2x mock agreements, one x for the last of the month, one x for the 28th
    sinon.assert.calledWithExactly(shipmentStub, mockAgreementsOn28.length + mockAgreementsOnLastDay.length)
  })

  after(function () {
    sinon.reset()
  })
})