const config = require('../config.js')
const mysql = require('mysql2/promise')
const rounding = require('./rounding.js')

//Load sub-modules
const donors = require('./DAO_modules/donors.js')
const organizations = require('./DAO_modules/organizations.js')
const donations = require('./DAO_modules/donations.js')

//Export DAO
module.exports = {
    connect: async function() {
        var con = await mysql.createPool({
            host: config.db_host,
            user: config.db_username,
            password: config.db_password,
            database: config.db_name
        })
    
        global.con = con

        console.log("Connected to DB")
    },

    //SubModules
    donors: donors,
    organizations: organizations,
    donations: donations,
}
