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
 * Gets permission data from an array of permission shortnames
 * @param {Array} shortnames an array of string shortnames
 * @returns {Array} an array of permissions 
 */
function getPermissionsFromShortnames(shortnames) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`
                SELECT ID, shortname, description FROM Access_permissions

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
 * Checks whether access token grants a given permission
 * @param {String} token Access token
 * @param {String} permission A specific permission
 * @returns {Number} The userID of the authorized user, returns null if no found
 * 
 * @throws {Error} Error with string message 'invalid_token'
 * @throws {Error} Error with string message 'insufficient_scope'
 */
function getCheckPermissionByToken(token, permission) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [user] = await con.query(`
                SELECT  
                    K.Donor_ID
                    
                    FROM Access_tokens as T

                    INNER JOIN Access_keys as K
                        ON T.Key_ID = K.ID

                    WHERE T.token = ?
                    LIMIT 1
            `, [token])

            if (user.length == 0)
                reject(new Error("invalid_token"))

            var [result] = await con.query(`
                SELECT 1
                    FROM Access_tokens as T
                    
                    INNER JOIN Access_keys_permissions as Combine
                        ON T.Key_ID = Combine.Key_ID
                    
                    INNER JOIN Access_permissions as P
                        ON P.ID = Combine.Permission_ID

                    WHERE 
                        T.token = ?
                        AND
                        P.shortName = ?
                    `, 
                    [token, permission])

            if (result.length > 0) 
                fulfill(user[0].Donor_ID)
            else 
                reject(new Error("insufficient_scope"))
        } catch (ex) {
            reject(ex)
            return false
        }
    })
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
                        
                WHERE 
                    AP.Application_ID = ?
                    AND
                    P.shortname IN(?)`, 
                    [applicationID, permissions])
        } catch (ex) {
            reject(ex)
            return false
        }

        if (result.length == permissions.length) fulfill(true)
        else fulfill(false)
    })
}

/**
 * Checks whether donor has access to given permissions
 * @param {Array} permissions An array of string permissions
 * @param {Number} donorID The ID of the donor in the database
 * @returns {Boolean}
 */
function checkDonorPermissions(donorID, permissions) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [restrictedQuery] = await con.query(`
                SELECT P.shortname FROM Access_restricted_permissions as RP
                    INNER JOIN Access_permissions as P
                        ON RP.Permission_ID = P.ID
                        
                WHERE
                    RP.Donor_ID = ?
                    AND
                    P.shortname IN(?)
                    AND
                    P.restricted = 1`,
                    [donorID, permissions])

            let restrictedPermissionsFound = restrictedQuery.length

            var [defaultQuery] = await con.query(`
                SELECT shortname FROM Access_permissions
                
                WHERE 
                    shortname IN(?)
                    AND
                    restricted = 0`,
                [permissions])

            let openPermissionsFound = defaultQuery.length

            if (restrictedPermissionsFound + openPermissionsFound == permissions.length) {
                fulfill(true)
                return true
            } else {
                fulfill(false)
                return false
            }
        } catch (ex) {
            reject(ex)
            return false
        }
    })
}

/**
 * Get application data from clientID
 * @param {String} clientID The clientID
 * @return {Object} An object with the applications name, id, secret and an array of allowed redirect uris
 */
function getApplicationByClientID(clientID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.query(`
                SELECT * FROM Access_applications
                        
                WHERE clientID = ?`, 
                    [clientID])

            if (result.length == 0) return fulfill(null)

            var application = result[0]

            var [callbacks] = await con.query(`
                SELECT callback FROM Access_applications_callbacks

                WHERE ApplicationID = ?`, 
                    [application.ID]);

            application.callbacks = callbacks.map((row) => row.callback)

            fulfill(application)
        } catch (ex) {
            reject(ex)
            return false
        }
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

/**
 * Checks whether a given access key has expired
 * @param {String} accessKey 
 * @returns {Object} an access key object from DB
 */
function getValidAccessKey(accessKey) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query(`
                SELECT * FROM Access_keys
                    WHERE \`key\` = ? 
                    AND 
                    expires > NOW()
            `, [accessKey])
        } catch(ex) {
            reject(ex)
            return false
        }

        if (res.length > 0) fulfill(res[0])
        else fulfill(null)
    })
}
//endregion

//region Add
/**
 * Adds a access key with given permissions. Presumes user and application is authenticated!
 * @param {Number} donorID
 * @param {Number} applicationID
 * @param {Array} permissions an array of Permission objects from database
 * @returns {Object} an access key object, with key and expires as properties
 */
function addAccessKey(donorID, applicationID, permissions) {
    return new Promise(async (fulfill, reject) => {
        try {
            var transaction = await con.startTransaction()
            
            //Create and insert access new key
            let accessKey = crypto.getAccessKey()

            var res = await transaction.query(`
                INSERT INTO Access_keys
                    SET
                    ?
            `, {
                key: accessKey, 
                Donor_ID: donorID, 
                Application_ID: applicationID
            })

            let accessKeyID = res[0].insertId;

            if (!accessKeyID) {
                await con.rollbackTransaction(transaction)
                reject(new Error("Access key insert failed"))
                return false;
            }

            //Insert permissions connected to key
            var res = await transaction.query(`
                INSERT INTO Access_keys_permissions
                    (Key_ID, Permission_ID) VALUES ?`, 
                [
                    permissions.map((permission) => {
                        return [accessKeyID, permission.ID];
                    })
                ])

            //Get access key
            var [accessKeyQuery] = await transaction.query(`
                SELECT * FROM Access_keys
                WHERE ID = ?
                LIMIT 1
            `, [accessKeyID])

            if (accessKeyQuery.length > 0) {
                await con.commitTransaction(transaction)
                fulfill({
                    key: accessKeyQuery[0].key,
                    expires: new Date(accessKeyQuery[0].expires)
                })
                return true
            } else {
                await con.rollbackTransaction(transaction) 
                reject(new Error("Recently inserted AccessKey not found in DB"))
                return false
            }
        } catch(ex) {
            await con.rollbackTransaction(transaction)
            reject(ex)
            return false
        }
    })
} 

/**
 * Creates an access token for a given access key
 * @param {String} accessKey The access key
 * @returns {String} Inserted access token
 */
function addAccessTokenByAccessKey(accessKey) {
    return new Promise(async (fulfill, reject) => {
        try {
            var accesKey = await getValidAccessKey(accessKey)
            if (!accesKey) {
                throw new Error("Invalid access key")
            }

            var token = crypto.getAccessToken()

            var [res] = await con.query(`
                INSERT INTO Access_tokens
                    SET ?
            `, {
                Key_ID: accesKey.ID, 
                token: token
            })

            var [expires] = await con.query(`SELECT 
                expires
                FROM Access_tokens
                WHERE token = ?`, [token])

            if (!res.insertId) {
                throw new Error("Failed to insert access token")
            } else {
                fulfill({
                    token,
                    expires: new Date(expires[0].expires)
                })
            }
        } catch(ex) {
            reject(ex)
            return false
        }
    })
}
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
/**
 * Deletes an access key and associated tokens
 * Essentially a logout function
 * @param {string} accessKey The access key to be the basis of deletion
 * @returns {boolean} To indicate success or failure
 */
function deleteAccessKey(accessKey) {
    return new Promise(async (fulfill, reject) => {
        try {
            var result = await con.query(`
                DELETE FROM Access_keys
                WHERE 
                    \`key\` = ?`, [accessKey])

            fulfill(result[0].affectedRows == 1)
        }
        catch(ex) {
            reject(ex)
            return false
        }
    })
}

/** 
 * Deletes a password resett token
 * @param {string} token The password reset token
 * @returns {boolean} To indicate success or failure 
 * */
function deletePasswordResetToken(token) {
    return new Promise(async (fulfill, reject) => {
        try {
            var result = await con.query(`
                DELETE FROM ChangePass
                WHERE
                    token = ?`, [token])

            fulfill(result[0].affectedRows > 0)
            return true
        } catch(ex) {
            reject(ex)
            return false
        }
    })
}
//endregion

module.exports = {
    getDonorByChangePassToken,
    getCheckPermissionByToken,
    getApplicationByClientID,
    getPermissionsFromShortnames,
    getDonorByCredentials,
    checkApplicationPermissions,
    checkDonorPermissions,
    updateDonorPassword,
    addAccessKey,
    addAccessTokenByAccessKey,
    deleteAccessKey,
    deletePasswordResetToken,

    setup: (dbPool) => { con = dbPool }
}