const config = require('../config')
const mysql = require('mysql2/promise')

module.exports = {
    //Submodules
    donors: require('./DAO_modules/donors'),
    organizations: require('./DAO_modules/organizations'),
    donations: require('./DAO_modules/donations'),
    distributions: require('./DAO_modules/distributions'),
    payment: require('./DAO_modules/payment'),
    vipps: require('./DAO_modules/vipps'),
    csr: require('./DAO_modules/csr'),
    parsing: require('./DAO_modules/parsing'),
    referrals: require('./DAO_modules/referrals'),
    auth: require('./DAO_modules/auth'),
    meta: require('./DAO_modules/meta'),

    /**
     * Sets up a connection to the database, uses config.js file for parameters
     * @param {function} cb Callback for when DAO has been sucessfully set up
     */
    connect: async function(cb) {
        var dbPool = await mysql.createPool({
            host: config.db_host,
            user: config.db_username,
            password: config.db_password,
            database: config.db_name,
            keepAlive: true
        })

        //Check whether connection was successfull
        //Weirdly, this is the proposed way to do it
        try {
            await dbPool.query("SELECT 1 + 1 AS Solution")
            console.log("Connected to database | Using database " + config.db_name)
        } catch(ex) {
            console.error("Connection to database failed! | Using database " + config.db_name)
            console.log(ex)
            process.exit()
        }
    
        //Setup submodules
        this.donors.setup(dbPool)      
        this.organizations.setup(dbPool)
        this.donations.setup(dbPool, this)
        this.distributions.setup(dbPool, this)
        this.payment.setup(dbPool)
        this.vipps.setup(dbPool)
        this.csr.setup(dbPool)
        this.parsing.setup(dbPool)
        this.referrals.setup(dbPool)
        this.auth.setup(dbPool)
        this.meta.setup(dbPool)

        //Convenience functions for transactions
        //Use the returned transaction object for queries in the transaction
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
                transaction.release()
            } catch(ex) {
                console.log(ex)
                throw new Error("Fatal error, failed to rollback transaction")
            }
        }

        dbPool.commitTransaction = async function(transaction) {
            try {
                await transaction.query("COMMIT")
                transaction.release()
            } catch(ex) {
                console.log(ex)
                throw new Error("Fatal error, failed to commit transaction")
            }
        }

        cb()
    }
}
