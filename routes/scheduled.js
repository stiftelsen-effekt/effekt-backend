const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const avtalegiroParser = require('../custom_modules/parsers/avtalegiro')
const avtalegiro = require('../custom_modules/avtalegiro')
const DAO = require('../custom_modules/DAO')

const META_OWNER_ID = 3
var fs = require('fs');

router.post("/nets", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const latestOcrFile = await nets.getLatestOCRFile()

    const parsed = ocrParser.parse(latestOcrFile.toString())

    const result = await ocr.addDonations(parsed, META_OWNER_ID)

    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

router.post("/nets/complete", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const files = await nets.getOCRFiles()

    /**
     * This function is very suboptimal, as each file get creates a new SFTP connection
     * and disposes of it after fetching the file
     */

    let results = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileBuffer = await nets.getOCRFile(file.name)
      const parsed = ocrParser.parse(fileBuffer.toString())
      const result = await ocr.addDonations(parsed, META_OWNER_ID)
      results.push(result)
    }

    res.json(results)
  } catch(ex) {
    next({ex})
  }
})

router.post("/nets/avtalegiro", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    let avtaleGiroFile = getStartRecordTransmission() + getStartRecordAccountingData(10);

    //ask håkon about this part
    const files = await nets.getOCRFiles()

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileBuffer = await nets.getOCRFile(file.name);
      const agreementsArray = avtalegiro.parse(fileBuffer.toString());

      let terminatedAgreements = "";
      let dates = [];

      let totalActiveAgreements = 0;
      let sumActiveAmounts = 0; 
      let activeDates = [];

      let totalTerminatedAgreements = 0;
      let sumTerminatedAmounts = 0; 
      let terminatedDates = [];

      agreementsArray.forEach(agreement => {
        DAOagreement = DAO.avtalegiroagreements.getByAvtalegiroKID(agreement.KID)

        if(agreement.terminated){
          terminatedAgreements += `\n${getFirstAndSecondLine(DAOagreement, 93)}`
          await DAO.avtalegiroagreements.remove(agreement.KID)
          totalTerminatedAgreements += 1;
          sumTerminatedAmounts += DAOagreement.amount;
          terminatedDates.push(DAOagreement.payment_date);
        } else {
          avtaleGiroFile += getFirstAndSecondLine(DAOagreement, 02)
          dates.push(new Date(DAOagreement.payment_date));
          if(agreement.isAltered){
            await DAO.avtalegiroagreements.update(agreement.KID, agreement.notice);
          }
          totalActiveAgreements += 1;
          sumActiveAmounts += DAOagreement.amount;
          activeDates.push(DAOagreement.payment_date);
        }
      });

      var latestTerminatedDate=new Date(Math.max.apply(null,dates));
      var earliestTerminatedDate=new Date(Math.min.apply(null,dates));

      var latestActiveDate=new Date(Math.max.apply(null,dates));
      var earliestActiveDate=new Date(Math.min.apply(null,dates));

      avtaleGiroFile += getEndRecordAccountingData(88, totalActiveAgreements, sumActiveAmounts, latestActiveDate, earliestActiveDate)

      avtaleGiroFile += getStartRecordAccountingData(36);
      avtaleGiroFile += terminatedAgreements;
      avtaleGiroFile += getEndRecordAccountingData(36, totalTerminatedAgreements, sumTerminatedAmounts, latestTerminatedDate, earliestTerminatedDate)

      totalAgreements = totalActiveAgreements + totalTerminatedAgreements;
      sumAmount = sumActiveAmounts + sumAmount;

      var latestDate = (latestActiveDate >= latestTerminatedDate) ? latestActiveDate : latestTerminatedDate;
      var earliestDate = (earliestActiveDate >= earliestTerminatedDate) ? earliestActiveDate : earliestTerminatedDate;

      avtaleGiroFile += getEndRecordAccountingData(89, totalAgreements, sumTerminatedAmounts, sumAmount, latestDate, earliestDate)

      fs.writeFile('mynewfile3.txt', avtaleGiroFile, function (err) {
        if (err) throw err;
      });
      
      //seems fair to do?, might wanna do it later on when its returned through ocr files idk
      const result = await ocr.addDonations(parsed, META_OWNER_ID);
      results.push(result);
    }

    res.json(results)
  } catch(ex) {
    next({ex})
  }
})

module.exports = router