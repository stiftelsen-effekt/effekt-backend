const moment = require('moment')

module.exports = {
    /** A function that checks for the parameters formDate and toDate, and returns JS Date objects coresponding. Throws exception if errors.
     * @param {object} req An express request object, from router
     * @returns {object} Returns an object with to properties, fromDate and toDate, both JS Dates
     */
    createDateObjectsFromExpressRequest: function(req) {
        //Check if no parameters
        if (!req.query || !req.body) throw new Error("No query or body parameters, please include fromDate and toDate parameters in ISO_8601 format.")

        var fromDate = req.query.fromDate || req.body.fromDate 
        var toDate = req.query.toDate || req.body.toDate

        //Check if dates are valid ISO 8601
        if (!moment(fromDate, moment.ISO_8601, true).isValid() || !moment(toDate, moment.ISO_8601, true).isValid()) throw new Error("Dates must be in ISO 8601 format");

        return {
            fromDate: new Date(fromDate),
            toDate: new Date(toDate)
        }
    }
}