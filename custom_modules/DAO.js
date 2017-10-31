const config = require('../config.js')
const mysql = require('mysql2/promise')
const rounding = require('./rounding.js')

//Export DAO
module.exports = {
    connect: async function() {
        var dbPool = await mysql.createPool({
            host: config.db_host,
            user: config.db_username,
            password: config.db_password,
            database: config.db_name
        })
    
        //Load submodules
        this.donors = require('./DAO_modules/donors.js')(dbPool)
        this.organizations = require('./DAO_modules/organizations.js')(dbPool)
        this.donations = require('./DAO_modules/donations.js')(dbPool)

        console.log("Connected to DB")
    }
}
