var con

// Get all donations by id
function getAllDonationsByDonorId(donorId) {
    return new Promise(async (resolve, reject) => {
        try {
            var [res] = await con.query('SELECT * FROM EffektDonasjonDB.Donations WHERE Donor_ID = ?', [donorId])
            // Kan hente bare sum_confirmed?
            var total = 0
            if (res.length > 0) {
                total = res.reduce((accumulator, current) => {
                    return accumulator + Number.parseInt(current.sum_confirmed)
                }, 0)
            }

            resolve(total)
        }
        catch (exception) {
            console.log(exception)
            reject(exception)
        }
    })
}

module.exports = function(dbPool) {
    con = dbPool

    return {
        getAllDonationsByDonorId,
    }
}