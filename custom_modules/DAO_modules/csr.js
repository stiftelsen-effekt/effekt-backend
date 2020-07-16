var con

// Get all donations by id
async function getAllDonationsByDonorId(donorId) {
    try {
        var [res] = await con.query('SELECT * FROM EffektDonasjonDB.Donations WHERE Donor_ID = ?', [donorId])
        // Kan hente bare sum_confirmed?
        var total = 0
        if (res.length > 0) {
            total = res.reduce((accumulator, current) => {
                return accumulator + Number.parseInt(current.sum_confirmed)
            }, 0)
        }

        return total
    }
    catch (exception) {
        throw exception
    }
}

module.exports = {
    getAllDonationsByDonorId,

    setup: (dbPool) => { con = dbPool }
}