const DAO = require('./DAO.js')

module.exports = {
    generate: function() {
        var KID = Array.from({length: 5}, () => {
            return Math.floor(9 * Math.random()) + 1;
        }).join("")

        return parseInt(KID)
    }
}