const config = require('../config.js')
const mysql = require('mysql2/promise')

var con;

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
       // console.log(con);
    },

    //Donors / USers
    donors: {
        getKIDByEmail: function(email) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [result] = await con.execute(`SELECT * FROM Donors where email = ?`, [email])
                } catch (ex) {
                    reject(ex)
                }

                if (result.length > 0) fulfill(result[0].KID)
                else fulfill(null)
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
                        userObject.KID,
                        userObject.email,
                        userObject.firstName,
                        userObject.lastName
                    ])
                }
                catch(ex) {
                    return reject(ex)
                }
                
                fulfill(res[0].insertId)
            })
        },
        remove: function(userID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    
                }
                catch(ex) {
                    return reject(ex)
                }

                fulfill()
            })
        },
        getByKID: function(KID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [result] = await con.execute(`SELECT * FROM Donors where KID = ? LIMIT 1`, [KID])
                } catch (ex) {
                    reject(ex)
                }

                if (result.length > 0) fulfill(result[0])
                else fulfill(null)
            })
        }
    },

    //Organizations
    organizations: {
        getByIDs: function(IDs) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute("SELECT * FROM Organizations WHERE ID in (" + ("?,").repeat(IDs.length).slice(0,-1) + ")", IDs)
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
                        id: org.ID,
                        name: org.org_abbriv,
                        shortDesc: org.shortDesc,
                        standardShare: org.std_percentage_share
                    }
                }))
            })
        },
        getStandardSplit: function() {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [standardSplit] = await con.execute(`SELECT * FROM Organizations WHERE std_percentage_share > 0 AND active = 1`)
                }
                catch(ex) {
                    return reject(ex)
                }

                fulfill(standardSplit.map((org) => {
                    return {
                        organizationID: org.ID,
                        name: org.org_full_name,
                        share: org.std_percentage_share
                    }
                }))
            })
        }
    },

    //Donations
    donations: {
        add: function(donationObject) {
            return new Promise(async (fulfill, reject) => {

                console.log(donationObject.split.reduce((acc, split) => {
                    console.log(split)
                    return acc + split.share
                }, 0))
                //Run checks
                if (donationObject.split.reduce((acc, split) => acc + split.share, 0) != 100) return reject(new Error("Donation shares do no app to 100"))
                
                //Insert donation
                try {
                    var [res] = await con.execute(`INSERT INTO Donations (
                            Donor_KID, 
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
             //   console.log(donationID);
                try {
                    await con.query(`INSERT INTO Donation_distribution (
                        DonationID,
                        OrgID,
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
                    //clean up donation registration
                    try {
                        await con.execute("DELETE FROM Donations WHERE ID = ?", [donationID])
                    } 
                    catch (ex) {
                        console.log("Failed to delete Donation after distribution failed")
                        console.log(ex)
                    }

                    return reject(ex)
                }

                fulfill(donationID);
            })
        },
        getByID: function(ID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donation] = await con.execute(`SELECT * FROM Donations WHERE ID = ? LIMIT 1`, [ID])
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
                        ID, 
                        std_percentage_share 
                        
                        FROM Organizations 
                        
                        WHERE 
                            std_percentage_share > 0 
                            AND 
                            active = 1`)
                } catch(ex) {
                    return reject(ex)
                }

                fulfill(organizations)
            })
        },
        getFullDonationById: function(id) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donation] = await con.execute(`SELECT * FROM Donations WHERE ID = ? LIMIT 1`, [id])
                    var [split] = await con.execute(`SELECT * FROM Donation_distribution WHERE DonationID = ?`, [id])
                }
                catch(ex) {
                    return reject(ex)
                }

//console.log(split);

                if (donation.length > 0) {
                    donation[0].split = split
                }
                fulfill(donation[0])
            })
        },

        getAggregateByTime: function(startTime, endTime) {
            return new Promise(async (fulfill, reject) => {
                
            })
        }
    },
}
