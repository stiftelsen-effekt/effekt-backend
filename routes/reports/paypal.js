const DAO = require('../../custom_modules/DAO.js')
//TODO: const paypal = require('../../custom_modules/parsers/paypal.js')

const PAYPAL_ID = 3

module.exports = async (req, res, next) => {
    if (!req.files || !req.files.report) return res.sendStatus(400)
  
    var transactions;
    try {
      transactions = req.files.report.data
    } catch(ex) {
      next(ex)
      return false
    }
}