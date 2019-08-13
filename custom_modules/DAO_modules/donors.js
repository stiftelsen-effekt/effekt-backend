var con

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
 * @returns {Object} A donor object
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
 * Takes a KID and returns the Donor associated with the KID
 * Returns null if no donor found
 * @param {Number} KID 
 */
async function getByKID(KID) {
    let [result] = await con.query(`
        SELECT
            Donors.ID,
            Donors.email,
            Donors.full_name,
            Donors.date_registered
            
            FROM Donors
            
            INNER JOIN Combining_table
                ON Donors.ID = Combining_table.Donor_ID
                
            WHERE KID = ?
            
            GROUP BY Donors.ID`, [KID])
    
    if (result.length === 0) return null; 

    return {
        id: result[0].ID,
        name: result[0].full_name,
        email: result[0].email,
        registered: result[0].date_registered
    };
}

/**
 * Searches for a user with either email or name matching the query
 * @param {string} query A query string trying to match agains full name and email
 * @return {array} An array of donor objects
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
 * @param {Object} donorObject A donorObject with two properties, email (string) and name(string)
 * @returns {Number} The ID of the new Donor if successfull
 */
function add(donorObject) {
    return new Promise(async (fulfill, reject) => {
        try {
            var res = await con.execute(`INSERT INTO Donors (
                email,
                full_name
            ) VALUES (?,?)`, 
            [
                donorObject.email,
                donorObject.name
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
//endregion

//region Delete
//endregion

module.exports = {
    getByID,
    getIDbyEmail,
    getByKID,
    search,
    add,

    setup: (dbPool) => { con = dbPool }
}