const fs = require("fs");
const parseUtil = require('./parsers/util')
const DAO = require('./DAO')


async function generateAvtaleGiroFile(files) {
  let avtaleGiroFile = parseUtil.getStartRecordTransmission() + parseUtil.getStartRecordAccountingDataAndDeleted(10);

  let terminatedAgreements = "";
  let dates = [];

  let totalActiveAgreements = 0;
  let sumActiveAmounts = 0;
  let activeDates = [];

  let totalTerminatedAgreements = 0;
  let sumTerminatedAmounts = 0;
  let terminatedDates = [];

  let agreementsArray = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // ask håkon
    const fileBuffer = await nets.getOCRFile(file.name);
    agreementsArray.push(avtalegiro.parse(fileBuffer.toString())); 
  }

  agreementsArray.forEach(agreement => {
    DAOagreement = DAO.avtalegiroagreements.getByAvtalegiroKID(agreement.KID)

    if (agreement.terminated) {
      terminatedAgreements += `\n${parseUtil.getFirstAndSecondLine(DAOagreement, 93)}`
      //slette
      await DAO.avtalegiroagreements.remove(agreement.KID)
      totalTerminatedAgreements += 1;
      sumTerminatedAmounts += DAOagreement.amount;
      terminatedDates.push(DAOagreement.payment_date);
    } else {
      avtaleGiroFile += parseUtil.getFirstAndSecondLine(DAOagreement, 02)
      if (agreement.isAltered) {
        await DAO.avtalegiroagreements.update(agreement.KID, agreement.notice);
      }
      totalActiveAgreements += 1;
      sumActiveAmounts += DAOagreement.amount;
      activeDates.push(DAOagreement.payment_date);
    }
  });

  var latestTerminatedDate = new Date(Math.max.apply(null, dates));
  var earliestTerminatedDate = new Date(Math.min.apply(null, dates));

  var latestActiveDate = new Date(Math.max.apply(null, dates));
  var earliestActiveDate = new Date(Math.min.apply(null, dates));

  avtaleGiroFile += getEndRecordAccountingData(88, totalActiveAgreements, sumActiveAmounts, latestActiveDate, earliestActiveDate)

  avtaleGiroFile += getStartRecordAccountingDataAndDeleted(36);
  avtaleGiroFile += terminatedAgreements;
  avtaleGiroFile += getEndRecordAccountingData(36, totalTerminatedAgreements, sumTerminatedAmounts, latestTerminatedDate, earliestTerminatedDate)

  totalAgreements = totalActiveAgreements + totalTerminatedAgreements;
  sumAmount = sumActiveAmounts + sumAmount;

  var latestDate = (latestActiveDate >= latestTerminatedDate) ? latestActiveDate : latestTerminatedDate;
  var earliestDate = (earliestActiveDate >= earliestTerminatedDate) ? earliestActiveDate : earliestTerminatedDate;

  avtaleGiroFile += getEndRecordAccountingData(89, totalAgreements, sumTerminatedAmounts, sumAmount, latestDate, earliestDate)

  file = fs.writeFile('mynewfile3.txt', avtaleGiroFile, function (err) {
    if (err) throw err;
  });

  return file;
}

module.exports = {
  generateAvtaleGiroFile,
}