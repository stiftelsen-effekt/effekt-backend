const reporting = require('../../custom_modules/reporting.js')
const dateRangeHelper = require('../../custom_modules/dateRangeHelper.js')
const DAO = require('../../custom_modules/DAO.js')
const moment = require('moment')

module.exports = async (req, res, next) => {
    try {
      let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req)
  
      let donationsFromRange = await DAO.donations.getFromRange(dates.fromDate, dates.toDate)
  
      if (req.query.filetype === "json") {
        res.json({
          status: 200,
          content: donationsFromRange
        })
      }
      else if (req.query.filetype === "excel") {
        let organizations = await DAO.organizations.getAll();
        let excelFile = reporting.createExcelFromIndividualDonations(donationsFromRange, organizations)
  
        res.writeHead(200, {
          'Content-Type': 'application/vnd.ms-excel',
          'Content-disposition': 'attachment;filename=Individual_Donations_' + moment(dates.fromDate).format('YYYY-MM-DD') + '_to_' + moment(dates.toDate).format('YYYY-MM-DD') + '.xlsx',
          'Content-Length': excelFile.length
        });
        res.end(excelFile);
      } else {
        res.status(400).json({
          code: 400,
          content: "Please provide a query parameter 'filetype' with either excel or json as value"
        })
      }
    }
    catch(ex) {
      next({ex: ex})
    }
  }