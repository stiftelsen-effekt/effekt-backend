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

        //Check whether connection was successfull
        //Weirdly, this is the proposed way to do it
        try {
            await dbPool.query("SELECT 1 + 1 AS Solution")
            console.log("Connected to database | Using " + config.db_name)
        } catch(ex) {
            console.error("Connection to database failed! | Using " + config.db_name)
            console.log(ex)
        } 
    
        //Load submodules
        this.donors =           require('./DAO_modules/donors.js')(dbPool)
        this.organizations =    require('./DAO_modules/organizations.js')(dbPool)
        this.donations =        require('./DAO_modules/donations.js')(dbPool)
        this.csr =              require('./DAO_modules/csr.js')(dbPool)
        this.auth =             require('./DAO_modules/auth.js')(dbPool)

        dbPool.startTransaction = async function() {
            try {
                let transaction = await dbPool.getConnection()
                await transaction.query("START TRANSACTION")
                return transaction
            } catch(ex) {
                console.log(ex)
                throw new Error("Fatal error, failed to start transaction")
            }
        }

        dbPool.rollbackTransaction = async function(transaction) {
            try {
                await transaction.query("ROLLBACK")
            } catch(ex) {
                console.log(ex)
                throw new Error("Fatal error, failed to rollback transaction")
            }
        }

        dbPool.commitTransaction = async function(transaction) {
            try {
                await transaction.query("COMMIT")
            } catch(ex) {
                console.log(ex)
                throw new Error("Fatal error, failed to commit transaction")
            }
        }

        console.log("DAO setup complete")
    }
}
