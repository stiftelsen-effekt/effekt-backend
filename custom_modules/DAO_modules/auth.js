const crypto = require(global.appRoot + '/custom_modules/crypto.js')

var con

//region Get

/**
 * Returns a Donor object if a valid change password key is found in Database
 * @param {string} key A 40 hcaracter long random key
 * @returns {?object} A Donor object
 */
function getDonorByChangePassKey(key) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`SELECT D.ID, D.full_name 
            FROM ChangePass as C 
            INNER JOIN Donors as D
            ON C.userID = D.ID
            WHERE C.key = ? AND expires > NOW()
            LIMIT 1`, [key])
        } catch (ex) {
            reject(ex)
            return false
        }

        if (result.length > 0) fulfill({
            id: result[0].ID,
            fullName: result[0].full_name
        })
        else fulfill(null)
    })
}

//endregion

//region Add
//endregion

//region Modify
/**
 * Updates a Donors password in the database
 * Does all the cryptographic work, salting and hashing
 * @param {number} userId Donors ID
 * @param {string} password Donors chosen password in plaintext
 * @returns {boolean} To indicate success or failiure
 */
function updateDonorPassword(donorID ,password) {
    return new Promise(async (fulfill, reject) => {
        let salt = crypto.getPasswordSalt();
        let hashedPassword = crypto.hashPassword(password, salt);

        try {
            var [result] = await con.query(`UPDATE Donors SET password_hash = ?, password_salt = ? WHERE ID = ?`, [hashedPassword, salt, donorID])
        } catch (ex) {
            reject(ex)
            return false
        }

        if (result.length > 0) fulfill(true)
        else fulfill(false)
    })
}
//endregion

//region Delete
//endregion

module.exports = function(dbPool) {
    con = dbPool

    return {
        getDonorByChangePassKey,
        updateDonorPassword
    }
} 