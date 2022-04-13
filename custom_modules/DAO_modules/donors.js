var pool

/**
 * @typedef Donor
 * @prop {number} id
 * @prop {string} email
 * @prop {string} name
 * @prop {string} ssn Social security number 
 * @prop {Date} registered
 * @prop {boolean} newsletter
 */

//region Get
/**
 * Gets the ID of a Donor based on their email
 * @param {String} email An email
 * @returns {Number} An ID
 */
async function getIDbyEmail(email) {
    try {
        var con = await pool.getConnection()
        var [result] = await con.execute(`SELECT ID FROM Donors where email = ?`, [email])

        con.release()
        if (result.length > 0) return (result[0].ID)
        else return (null)
    }
    catch (ex) {
        con.release()
        throw (ex)
    }
}

// Attempting to change getID function to not only select by mail. Going to replace getIDbyEmail
async function getDonorId(email, ssn) {
    console.log(3+5)
    try {
        var con = await pool.getConnection()
        var [result] = await con.execute("SELECT ID FROM Donors WHERE email = ? AND ssn = ?", 
        [email, ssn])

        con.release()
        if (result.length > 0) return (result[0].ID)
        else return null

    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Selects a Donor object from the database with the given ID
 * @param {Number} ID The ID in the database for the donor
 * @returns {Donor} A donor object
 */
async function getByID(ID) {
    try {
        var con = await pool.getConnection()
        var [result] = await con.execute(`SELECT * FROM Donors where ID = ? LIMIT 1`, [ID])

        con.release()

        if (result.length > 0) return ({
            id: result[0].ID,
            name: result[0].full_name,
            email: result[0].email,
            registered: result[0].date_registered,
            ssn: result[0].ssn,
            newsletter: result[0].newsletter,
            trash: result[0].trash,
        })
        else return (null)
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets a donor based on KID
 * @param {Number} KID
 * @returns {Donor | null} A donor Object
 */
async function getByKID(KID) {
    try {
        var con = await pool.getConnection()
        let [dbDonor] = await con.query(`SELECT    
            ID,
            email, 
            full_name,
            ssn,
            date_registered
            
            FROM Donors 
            
            INNER JOIN Combining_table 
                ON Donor_ID = Donors.ID 
                
            WHERE KID = ? 
            GROUP BY Donors.ID LIMIT 1`, [KID])

        con.release()
        if (dbDonor.length > 0) {
            return {
                id: dbDonor[0].ID,
                email: dbDonor[0].email,
                name: dbDonor[0].full_name,
                ssn: dbDonor[0].ssn,
                registered: dbDonor[0].date_registered
            }
        }
        else {
            return null
        }
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Gets donorID by agreement_url_code in Vipps_agreements
 * @property {string} agreementUrlCode
 * @return {number} donorID
 */
async function getIDByAgreementCode(agreementUrlCode) {
    let con = await pool.getConnection()
    let [res] = await con.query(`
        SELECT donorID FROM Vipps_agreements
        where agreement_url_code = ?
        `, [agreementUrlCode])
    con.release()

    if (res.length === 0) return false
    else return res[0].donorID
}

/**
 * Searches for a user with either email or name matching the query
 * @param {string} query A query string trying to match against full name and email
 * @returns {Array<Donor>} An array of donor objects
 */
async function search(query) {
    try {
        var con = await pool.getConnection()

        if (query === "" || query.length < 3) var [result] = await con.execute(`SELECT * FROM Donors LIMIT 100`, [query])
        else var [result] = await con.execute(`SELECT * FROM Donors 
            WHERE 
                MATCH (full_name, email) AGAINST (?)
                OR full_name LIKE ?
                OR email LIKE ?
                
            LIMIT 100`, [query, `%${query}%`, `%${query}%`])

        con.release()

        if (result.length > 0) {
            return (result.map((donor) => {
                return {
                    id: donor.ID,
                    name: donor.full_name,
                    email: donor.email,
                    ssn: donor.ssn,
                    registered: donor.date_registered
                }
            }))
        }
        else {
            return null
        }
    }
    catch (ex) {
        con.release()
        throw ex
    }
}
//endregion

//region Add
/**
 * Adds a new Donor to the database
 * @param {Donor} donor A donorObject with two properties, email (string) and name(string)
 * @returns {Number} The ID of the new Donor if successful
 */
async function add(email = "", name, ssn = "", newsletter = null) {
    try {
        var con = await pool.getConnection()

        var res = await con.execute(`INSERT INTO Donors (
            email,
            full_name, 
            ssn,
            newsletter
        ) VALUES (?,?,?,?)`,
            [
                email,
                name,
                ssn,
                newsletter
            ])

        con.release()
        return (res[0].insertId)
    }
    catch (ex) {
        con.release()
        throw ex
    }
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
    console.log("update ssn")
    try {
        var con = await pool.getConnection()
        let res = await con.query(`UPDATE Donors SET ssn = ? where ID = ?`, [ssn, donorID])
        con.release()
        return true
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * Updates donor and sets new newsletter value
 * @param {number} donorID
 * @param {boolean} newsletter 
 * @returns {boolean}
 */
async function updateNewsletter(donorID, newsletter) {
    try {
        var con = await pool.getConnection()
        let res = await con.query(`UPDATE Donors SET newsletter = ? where ID = ?`, [newsletter, donorID])
        con.release()
        return true
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

//endregion

//region Delete
//endregion

module.exports = {
    getByID,
    getIDbyEmail,
    getDonorId,
    getByKID,
    getIDByAgreementCode,
    search,
    add,
    updateSsn,
    updateNewsletter,

    setup: (dbPool) => { pool = dbPool }
}