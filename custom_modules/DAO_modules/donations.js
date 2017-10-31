//Get
function getByID(ID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donation] = await con.execute(`SELECT * FROM Donations WHERE ID = ? LIMIT 1`, [ID])
        } catch(ex) {
            return reject(ex)
        }

        fulfill(donation)
    })
}

function getStandardShares() {
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
}

function getFullDonationByKID(kid) {
    return new Promise(async (fulfill, reject) => {
        var fullDonations;
        try {
            var [donations] = await con.execute(`SELECT * FROM Donations WHERE KID_fordeling = ?`, [kid])

            var donationIDs = donations.map((donation) => donation.ID);

            var [split] = await con.execute(`
                SELECT orgID, DonationID, percentage_share FROM Donation_distribution 
                WHERE DonationID IN (` + ("?,").repeat(donationIDs.length).slice(0,-1) + `)`, donationIDs)

            donations.map((donation) => {
                var donation = donation;
                donation.split = split.filter((split) => split.DonationID == donation.ID).map((split) => { delete split.DonationID; return split; })})
        }
        catch(ex) {
            return reject(ex)
        }

        fulfill(donations)
    })
}

function getByDonor(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donations] = await con.execute(`SELECT * FROM Donations WHERE KID = ?`, [KID])
        }
        catch (ex) {
            reject(ex)
        }

        fulfill(donation)
    })
}

function getNonRegisteredByDonors(KIDs) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donations] = await con.execute(`SELECT * FROM EffektDonasjonDB.Donations 
                WHERE 
                Donor_KID IN (` + ("?,").repeat(KIDs.length).slice(0,-1) + `)
                AND date_confirmed IS NULL
                ORDER BY date_notified DESC`, KIDs)
        }
        catch(ex) {
            reject(ex)
        }

        fulfill(donations)
    })
}

function getFullDonationById(ID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donation] = await con.execute(`SELECT * FROM Donations WHERE Donor_KID = ? LIMIT 1`, [ID])
            var [split] = await con.execute(`SELECT * FROM Donation_distribution WHERE Dist_DonationID IN ?`, [ID])
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

function getAggregateByTime(startTime, endTime) {
    return new Promise(async (fulfill, reject) => {
        reject(new Error("Not implemented"))
    })
}

//Add
function add(donationObject) {
    return new Promise(async (fulfill, reject) => {

        //Run checks
        console.log("Trying to round")
        console.log("Rounding")
        if (rounding.sumWithPrecision(donationObject.split.map(split => split.share)) != 100) return reject(new Error("Donation shares do not sum to 100"))
        
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

        fulfill()
    })
}

//Modify
function registerConfirmedByIDs(IDs) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [donations] = await con.execute(`UPDATE EffektDonasjonDB.Donations 
                SET date_confirmed = NOW()
                WHERE 
                ID IN (` + ("?,").repeat(IDs.length).slice(0,-1) + `)`, IDs)
        }
        catch(ex) {
            reject(ex)
        }

        fulfill()
    })
}

//Delete

module.exports = {
    getByID,
    getStandardShares,
    getFullDonationByKID,
    getByDonor,
    getNonRegisteredByDonors,
    getFullDonationByKID,
    getAggregateByTime,
    add,
    registerConfirmedByIDs
}