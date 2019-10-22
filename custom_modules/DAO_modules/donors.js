var con

/**
 * @typedef Donor
 * @prop {number} id
 * @prop {string} email
 * @prop {string} name
 * @prop {string} ssn Social security number 
 * @prop {Date} registered
 */

//region Get
/**
 * Gets the ID of a Donor based on their email
 * @param {String} email An email
 * @returns {Number} An ID
 */
function getIDbyEmail(email) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.execute(`SELECT ID FROM Donors where email = ?`, [email])
        } catch (ex) {
            reject(ex)
        }

        if (result.length > 0) fulfill(result[0].ID)
        else fulfill(null)
    })
}

/**
 * Selects a Donor object from the database with the given ID
 * @param {Number} ID The ID in the database for the donor
 * @returns {Donor} A donor object
 */
function getByID(ID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.execute(`SELECT * FROM Donors where ID = ? LIMIT 1`, [ID])
        } catch (ex) {
            reject(ex)
        }

        if (result.length > 0) fulfill(result[0])
        else fulfill(null)
    })
}

/**
 * Searches for a user with either email or name matching the query
 * @param {string} query A query string trying to match agains full name and email
 * @returns {Array<Donor>} An array of donor objects
 */
function search(query) {
    return new Promise(async (fulfill, reject) => {
        try {
            if (query === "" || query.length < 3) var [result] = await con.execute(`SELECT * FROM Donors LIMIT 100`, [query])
            else var [result] = await con.execute(`SELECT * FROM Donors 
                WHERE 
                    MATCH (full_name, email) AGAINST (?)
                    OR full_name LIKE ?
                    OR email LIKE ?
                    
                LIMIT 100`, [query, `%${query}%`, `%${query}%`])
        } catch(ex) {
            reject(ex)
        }

        if (result.length > 0) fulfill(result.map((donor) => {
            return {
                id: donor.ID,
                name: donor.full_name,
                email: donor.email,
                ssn: donor.ssn,
                registered: donor.date_registered
            }
        }))
        else fulfill(null)
    })
}
//endregion

//region Add
/**
 * Adds a new Donor to the database
 * @param {Donor} donor A donorObject with two properties, email (string) and name(string)
 * @returns {Number} The ID of the new Donor if successfull
 */
function add(donor) {
    return new Promise(async (fulfill, reject) => {
        try {
            var res = await con.execute(`INSERT INTO Donors (
                email,
                full_name, 
                ssn
            ) VALUES (?,?, ?)`, 
            [
                donor.email,
                donor.name,
                donor.ssn
            ])
        }
        catch(ex) {
            return reject(ex)
        }
        
        fulfill(res[0].insertId)
    })
}
//endregion

//region Modify
/**
 * Updates donor and sets new SSN
 * @param {number} donorID
 * @param {string} ssn Social security number
 * @returns {boolean}
 */
async function updateSsn(donorID, ssn) {
    let res = await con.query(`UPDATE Donors SET ssn = ? where ID = ?`, [ssn, donorID])
    return true
}
//endregion

//region Delete
//endregion

module.exports = {
    getByID,
    getIDbyEmail,
    search,
    add,
    updateSsn,

    setup: (dbPool) => { con = dbPool }
}