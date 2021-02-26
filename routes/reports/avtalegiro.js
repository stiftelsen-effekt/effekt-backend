const AvtalegiroParser = require('../../custom_modules/parsers/avtalegiro.js')
const DAO = require('../../custom_modules/DAO.js')
const config = require('../../config')
const mail = require('../../custom_modules/mail')

module.exports = async (req, res, next) => {
    let metaOwnerID = parseInt(req.body.metaOwnerID)

    var data = req.files.report.data.toString('UTF-8')

    try {
        var transactions = AvtalegiroParser.parse(data)
    }   catch(ex) {
        return next(ex)
    }

    let valid = 0
    let invalid = 0
    let invalidTransactions = []
    
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]
        try {
            if(transaction.isAltered){
                
                // verdien 1 indikerer Nye /endrede faste betalingsoppdrag
                //tenker det lureste er å sjekke i db om kid eksisterer i tabellen, hvis ikke addde. funker?
            } else if (transaction.isTerminated){
                //slette fra db
            }
        }
        catch (ex) {
            invalidTransactions.push({
                reason: ex.message,
                transaction
            })
            invalid++
        }
    }
    

    res.json({
        status: 200,
        content: {
            valid: valid,
            //Not used
            invalid: invalid,
            invalidTransactions: invalidTransactions
        }
    })
}