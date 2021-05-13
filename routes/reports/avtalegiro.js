const AvtalegiroParser = require('../../custom_modules/parsers/avtalegiro.js')
const DAO = require('../../custom_modules/DAO.js')
const config = require('../../config')
const mail = require('../../custom_modules/mail')

module.exports = async (req, res, next) => {
    let metaOwnerID = parseInt(req.body.metaOwnerID)

    var data = req.files.report.data.toString('UTF-8')

    try {
        var agreements = AvtalegiroParser.parse(data)
    }   catch(ex) {
        return next(ex)
    }

    let valid = 0
    let invalid = 0
    let invalidAgreeemebts = []
    
    for (let i = 0; i < agreements.length; i++) {
        let agreement = agreements[i]
        try {
            if(agreement.isAltered){
                if(await DAO.distributions.KIDexists(agreement.KID)){
                    await DAO.avtalegiroagreements.update(agreement.KID, agreement.notice)
                } else{
                    //TODO:
                }
            } else if (agreement.isTerminated){
                await DAO.avtalegiroagreements.remove(agreement.KID)
                // Should probably deleted from combined table and donors to? 
                // Should we delete in the DB, or could we just have a isactive value and set to false? feel like that makes more sense
                // - BEX
            }
        }
        catch (ex) {
            invalidAgreements.push({
                reason: ex.message,
                agreement
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
            invalidAgreements: invalidAgreements
        }
    })
}