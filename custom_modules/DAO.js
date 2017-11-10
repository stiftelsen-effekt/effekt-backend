const config = require('../config.js')
const mysql = require('mysql2/promise')

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

        this.startTransaction = async function() {
            await dbPool.query("START TRANSACTION")
        }

        this.rollbackTransaction = async function() {
            await dbPool.query("ROLLBACK")
        }

        this.commitTransaction = async function() {
            await dbPool.query("COMMIT")
        }

        console.log("Connected to DB")
    }
}