const sqlString  = require('sqlString')
const DAO = require('../DAO')

var con

// Get all donations by id
function getAllDonationsByDonorId(donorId) {
    return new Promise(async (resolve, reject) => {
        try {
            var [res] = await con.query('SELECT * FROM EffektDonasjonDB.Donations WHERE DonorID = ?', [donorId])
            resolve(res)
        }
        catch (exception) {
            reject(exception)
        }
    })
}

module.exports = {
    getAllDonationsByDonorId,
}