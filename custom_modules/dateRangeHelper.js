const moment = require('moment')

module.exports = {
    /** A function that checks for the parameters formDate and toDate, and returns JS Date objects coresponding. Throws exception if errors.
     * @param {object} req An express request object, from router
     * @returns {object} Returns an object with to properties, fromDate and toDate, both JS Dates
     */
    createDateObjectsFromExpressRequest: function(req) {
        //Check if no parameters
        if (!req.query) throw new Error("No query parameters, please include fromDate and toDate parameters in ISO_8601 format.")

        //Check if dates are valid ISO 8601
        if (!moment(req.query.fromDate, moment.ISO_8601, true).isValid() || !moment(req.query.toDate, moment.ISO_8601, true).isValid()) throw new Error("Dates must be in ISO 8601 format");

        return {
            fromDate: new Date(req.query.fromDate),
            toDate: new Date(req.query.toDate)
        }
    }
}