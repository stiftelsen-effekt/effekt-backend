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
        getCountByEmail: function(email) {
            return new Promise((fulfill, reject) => {
                con.query(`SELECT * FROM Donors where email = ?`, [email], 
                (err, result) => {
                    if (err) reject(err)
                    else fulfill(result.length)
                })
            })
        },
        add: function(userObject) {
            return new Promise((fulfill, reject) => {
                con.query(`INSERT INTO Donors (
                    KID,
                    email,
                    first_name,
                    last_name
                ) VALUES (?,?,?,?)`, 
                [
                    Math.floor(Math.random() * 1000),
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
        getByIDs: function(IDs) {
            return new Promise((fulfill, reject) => {
                con.query("SELECT * FROM Organizations WHERE OrgID in (?)", [IDs], (err, result) => {
                    if (err) reject(err)
                    else fulfill(result)
                })
            })
        },
        getActive: function() {
            return new Promise((fulfill, reject) => {
                con.query(`SELECT * FROM Organizations WHERE active = 1`, (err, result) => {
                    if (err) reject(err)
                    else fulfill(result.map((item) => {
                        return {
                            id: item.OrgID,
                            name: item.org_abbriv,
                            shortDesc: item.shortDesc,
                            standardShare: item.std_percentage_share
                        }
                    }))
                })
            })
        }
    },

    //Donations
    donations: {
        add: function(donationObject) {
            return new Promise((fulfill, reject) => {
                con.query(`INSERT INTO Donations (
                        Donation_KID, 
                        sum_notified, 
                        payment_method, 
                        is_own_dist, 
                        is_std_dist
                    ) VALUES (?,?,?,?,?)`,
                    [
                        donationObject.KID,
                        donationObject.amount,
                        "bank",
                        (!donationObject.standardSplit ? 1 : 0),
                        (donationObject.standardSplit ? 1 : 0)
                    ],
                    (err, result) => {
                        if (err) reject(err)
                        else {
                            var donationID = result.insertId

                            console.log(donationObject.split.reduce((acc, org) => {
                                acc.push([donationID, org.organizationID, org.share]);
                                return acc;
                            }, []))

                            con.query(`INSERT INTO Donation_distribution (
                                Dist_DonationID,
                                Dist_OrgID,
                                percentage_share
                            ) VALUES ?`,
                            [
                                donationObject.split.reduce((acc, org) => {
                                    acc.push([donationID, org.organizationID, org.share]);
                                    return acc
                                }, [])
                            ],
                            (err, result) => {
                                if (err) reject(err)
                                else fulfill()
                            })
                        }
                    })
            })
        },
        getDonationByKID: function(KID) {
            return new Promise((fulfill, reject) => {
                con.query(`SELECT * FROM Donations WHERE Donation_KID = ?`, [KID], (err, result) => {
                    if (err) reject(err)
                    else fulfill(result)
                })
            })
        },
        getStandardShares: function() {
            return new Promise((fulfill, reject) => {
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