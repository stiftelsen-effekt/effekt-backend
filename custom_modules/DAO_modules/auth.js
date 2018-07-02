const crypto = require('../authorization/crypto.js')

var con

//region Get

/**
 * Returns a Donor object if a valid change password token is found in Database
 * @param {string} token A 40 hcaracter long random token
 * @returns {?object} A Donor object
 */
function getDonorByChangePassToken(token) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`
            SELECT 
                D.ID, 
                D.full_name 
            
            FROM ChangePass as C 
                INNER JOIN Donors as D
                    ON C.userID = D.ID
            
            WHERE C.token = ? AND expires > NOW()
            
            LIMIT 1`, [token])
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

/**
 * Checks whether access token grants a given permission
 * @param {String} token Access token
 * @param {String} permission A specific permission
 * @returns {Boolean}
 */
function getCheckPermissionByToken(token, permission) {
    return new Promise(async (fulfill, reject) => {
        try {
            throw "Needs updating for tokens instead of keys"
            var [result] = await con.query(`
                SELECT 1 
                    FROM Access_token as T
                    
                    INNER JOIN Access_keys_permissions as Combine
                        ON K.ID = Combine.Key_ID
                    
                    INNER JOIN Access_permissions as P
                        ON P.ID = Combine.Permission_ID
                        
                    WHERE 
                        T.token = ?
                        AND
                        P.shortName = ?`, 
                    [token, permission])
        } catch (ex) {
            reject(ex)
            return false
        }

        if (result.length > 0) fulfill(true)
        else fulfill(false)
    })
}

/**
 * Checks whether permissions are valid and user has access to them
 * @param {Array} permissions An array of string permissions
 * @param {Number} userID The ID of the user in the database
 * @returns {Boolean}
 */
function checkUserPermissions(userID, permissions) {

}

/**
 * Checks whether application has access to given permissions
 * @param {Array} permissions An array of string permissions
 * @param {Number} applicationID The ID of the application in the database
 * @returns {Boolean}
 */
function checkApplicationPermissions(applicationID, permissions) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`
                SELECT P.shortname FROM Access_applications_permissions as AP
                    INNER JOIN Access_permissions as P
                        ON AP.Permission_ID = P.ID
                        
                WHERE AP.Application_ID = ?`, 
                    [applicationID])
        } catch (ex) {
            reject(ex)
            return false
        }

        console.log(result)
        if (result.length > 0) fulfill(true)
        else fulfill(false)
    })
}

/**
 * Get application data from clientID
 * @param {String} clientID The clientID
 * @return {Object} An object with the applications name, id, secret and redirect uri
 */
function getApplicationByClientID(clientID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`
                SELECT * FROM Access_applications
                        
                WHERE clientID = ?`, 
                    [clientID])
        } catch (ex) {
            reject(ex)
            return false
        }

        if (result.length > 0) fulfill(result[0])
        else fulfill(null)
    })
}

/**
 * Gets permission data from an array of permission shortnames
 * @param {Array} shortnames an array of string shortnames
 * @returns {Array} an array of permissions 
 */
function getPermissionsFromShortnames(shortnames) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`
                SELECT shortname, description FROM Access_permissions

                WHERE shortname IN (?)
            `, [shortnames])
        } catch(ex) {
            reject(ex)
            return false
        }

        fulfill(result)
    })
}

/**
 * Checks email password combination, returns donor
 * @param {String} email
 * @param {String} password
 * @returns {Object} A Donor object, with id, name etc.
 */
function getDonorByCredentials(email, password) {
    return new Promise(async (fulfill, reject) => {
        try {
            //First get salt
            let [saltQuery] = await con.query(`
                SELECT password_salt from Donors

                WHERE email = ?
            `, [email])

            if (saltQuery.length == 0) {
                fulfill(null)
                return false
            } else {
                let salt = saltQuery[0].password_salt

                let passwordHash = crypto.hashPassword(password, salt)

                let [donorQuery] = await con.query(`
                    SELECT ID, full_name, email, date_registered FROM Donors

                    WHERE 
                        email = ?
                        AND
                        password_hash = ?
                `, [email, passwordHash])

                if (donorQuery.length > 0) {
                    fulfill(donorQuery.map((line) => {
                        return {
                            id: line.ID,
                            fullname: line.full_name,
                            email: line.email,
                            registered: line.date_registered
                        }
                    })[0])
                    return true
                } else {
                    fulfill(null)
                    return false
                }
            }
        } catch(ex) {
            reject(ex)
            return false
        }
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
        let salt = crypto.getPasswordSalt()
        let hashedPassword = crypto.hashPassword(password, salt)

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
        getDonorByChangePassToken,
        getCheckPermissionByToken,
        getApplicationByClientID,
        getPermissionsFromShortnames,
        getDonorByCredentials,
        checkApplicationPermissions,
        updateDonorPassword
    }
} 