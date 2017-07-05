const config = require('../config.js')
const mysql = require('mysql2/promise')

var con

module.exports = {
    //Setup
    createConnection: async function() {
        con = await mysql.createConnection({
            host: config.db_host,
            user: config.db_username,
            password: config.db_password,
            database: config.db_name
        })

        console.log("Connected to DB!")
    },

    //Users
    donors: {
        getCountByEmail: function(email) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var result = await con.query(`SELECT * FROM Donors where email = ?`, [email])
                } catch (ex) {
                    reject(ex)
                }

                fulfill(result.length)
            })
        },
        add: function(userObject) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var res = await con.execute(`INSERT INTO Donors (
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
                    ])
                }
                catch(ex) {
                    return reject(ex)
                }
                
                fulfill()
            })
        }
    },

    //Organizations
    organizations: {
        getByIDs: function(IDs) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute("SELECT * FROM Organizations WHERE OrgID in (" + ("?,").repeat(IDs.length).slice(0,-1) + ")", IDs)
                }
                catch (ex) {
                    reject(ex)
                }
                
                fulfill(organizations)
            })
        },
        getActive: function() {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute(`SELECT * FROM Organizations WHERE active = 1`)
                }
                catch (ex) {
                    return reject(ex)
                }

                fulfill(organizations.map((org) => {
                    return {
                        id: org.OrgID,
                        name: org.org_abbriv,
                        shortDesc: org.shortDesc,
                        standardShare: org.std_percentage_share
                    }
                }))
            })
        }
    },

    //Donations
    donations: {
        add: function(donationObject) {
            return new Promise(async (fulfill, reject) => {
                //Insert donation
                try {
                    var [res] = await con.execute(`INSERT INTO Donations (
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
                        ])
                    
                    console.log(res)
                }
                catch(ex) {
                    return reject(ex)
                }
                
                //Insert donation distribution rows
                var donationID = res.insertId

                try {
                    await con.query(`INSERT INTO Donation_distribution (
                        Dist_DonationID,
                        Dist_OrgID,
                        percentage_share
                    ) VALUES ?`,
                    [
                        donationObject.split.reduce((acc, org) => {
                            acc.push([donationID, org.organizationID, org.share]);
                            return acc
                        }, [])
                    ])
                } 
                catch(ex) {
                    return reject(ex)
                }

                fulfill()
            })
        },
        getDonationByKID: function(KID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donation] = await con.execute(`SELECT * FROM Donations WHERE Donation_KID = ? LIMIT 1`, [KID])
                } catch(ex) {
                    return reject(ex)
                }

                fulfill(donation)
            })
        },
        getStandardShares: function() {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute(`SELECT 
                        OrgID, 
                        std_percentage_share 
                        
                        FROM Organizations 
                        
                        WHERE 
                            std_percentage_share > 0 
                            AND 
                            active == 1`)
                } catch(ex) {
                    return reject(ex)
                }

                fulfill(organizations)
            })
        },
        getFullDonationById: function(id) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donation] = await con.execute(`SELECT * FROM Donations WHERE DonationID = ? LIMIT 1`, [id])
                    var [split] = await con.execute(`SELECT * FROM Donation_distribution WHERE Dist_DonationID = ?`, [id])
                }
                catch(ex) {
                    return reject(ex)
                }

                if (donation.length > 0) {
                    donation[0].split = split
                }
                
                fulfill(donation[0])
            })
        }
    },
}