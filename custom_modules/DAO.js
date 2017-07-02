const config = require('../config.js')
const mysql = require('mysql')

const con = mysql.createConnection({
    host: config.db_host,
    user: config.db_username,
    password: config.db_password,
    database: config.db_name
})

module.exports = {
    //Setup
    createConnection: function() {
        con.connect(function(err) {
            if (err) throw err
            console.log("Connected!")
        })
    },

    //Users
    donors: {
        add: function(userObject) {
            return new Promise((fullfill, rejcect) => {
                con.query(`INSERT INTO USERS (
                    email,
                    first_name,
                    last_name
                ) VALUES (?,?,?)`, 
                [
                    userObject.email,
                    userObject.firstName,
                    userObject.lastName
                ], 
                (err, result) => {
                    if (err) reject(err)
                    else fulfill(result)
                })
            })
        }
    },

    //Organizations
    organizations: {
        getById: function(IDs) {
            return new Promise((fulfill, reject) => {
                con.query("SELECT * FROM Organizations ", (err, result) => {
                    if (err) reject(err)
                    else fulfill(result)
                })
            })
        },
        getActive: function() {
            return new Promise((fulfill, reject) => {
                con.query(`SELECT * FROM Organizations WHERE active = 1`, (err, result) => {
                    if (err) reject(err)
                    else fulfill(result)
                })
            })
        }
    },

    //Donations
    donations: {
        add: function(donationObject) {

        },
        getDonationByUserId: function() {
            return new Promise((fulfill, reject) => {
                con.query(`SELECT * FROM `)
            })
        },
        getStandardShares: function() {
            return new Promes((fulfill, reject) => {
                con.query(`SELECT 
                    OrgID, 
                    std_percentage_share 
                    
                    FROM Organizations 
                    
                    WHERE 
                        std_percentage_share > 0 
                        AND 
                        active == 1`,
                    (err, result) => {
                        if (err) reject(err)
                        else fulfill (result)
                    })
            })
        }
    },
}