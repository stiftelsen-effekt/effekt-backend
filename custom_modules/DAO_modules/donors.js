const Fuse = require("fuse.js")
const { createCharge } = require("../vipps")

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

const options = {
    includeScore: true,
    threshold: 1.0
}

/**
 * Compares the input name to all donor names in the database with matching email
 * score 0 indicates perfect match, score 1 is a complete mismatch

 * @param {*} donorNames A list of the donor names in database with given email
 * @param {*} inputname The name in the input field in the donation widget
 * @returns * returns the index of the donor with the best name match score
 */
function fuzzyNameSearch(donorNames, inputname) {
    const fuse = new Fuse(donorNames, options)
    const fuseResults = fuse.search(inputname)

    console.log("Name search results, name compared to", inputname, fuseResults)
    var bestDonor = fuseResults[0]
    console.log("Best donor name match found!", bestDonor, "with score", bestDonor.score)

    return bestDonor.refIndex
}

/**
 * Gets the ID of a Donor based on their email
 * @param {String} email An email
 * @returns {Number} An ID of the donor if a match is found in the database
 */
async function getIDbyEmail(email, inputname) {
    try {
        var con = await pool.getConnection()
        var [result] = await con.execute(`SELECT ID, ssn, full_name FROM TaxUnit where email = ?`, [email])
        con.release()
        if (result.length > 0) {
            console.log("Registered names on this email:")
            donorNames = []
            for(i = 0; i < result.length; i++) {
                var name = result[i].full_name
                donorNames.push(name)
                
            }
            console.log("Donor names:", donorNames)
            donorIndex = fuzzyNameSearch(donorNames, inputname)
       
            console.log("Registering on donor ID:", result[donorIndex].ID, "with ssn", result[donorIndex].ssn)
            return (result[donorIndex].ID)
        }
        else {
            console.log("No matching email found")
            return (null)
        }
    }
    catch (ex) {
        con.release()
        throw (ex)
    }
}

/**
 * 
 * @param {*} email donor email from the input field
 * @returns the ID of the record in the Donors table with a matching email, if one exists. 
 */
async function getDonorId(email) {
    try {
        var con = await pool.getConnection()
        var [result] = await con.execute("SELECT ID FROM Donors WHERE email = ?", 
        [email])
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
 * 
 * @param {*} email email from inputfield
 * @param {*} ssn ssn from inputfield
 * @param {*} inputname name from inputfield
 * @returns the id of the record in the TaxUnit table that best matches the user input
 */
async function getTaxUnit(email, ssn, inputname) {
    try {
        if (ssn == "") {
            return getIDbyEmail(email, inputname)
        }
        var con = await pool.getConnection()
        var [result] = await con.execute("SELECT id FROM TaxUnit WHERE email = ? AND ssn = ?", 
        [email, ssn])
        if (result.length > 0) return (result[0].id)

        else {
            [result] = await con.execute("SELECT id FROM TaxUnit WHERE email = ? AND ssn = ?", [email, ""])
            con.release()
            if (result.length > 0) return (result[0].id)
            else return null
        }

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
 * 
 * @param {*} id the id of the TaxUnit record
 * @returns a TaxUnit object
 */
async function getTaxUnitById(id) {
    try {
        var con = await pool.getConnection()
        var [result] = await con.execute(`SELECT * FROM TaxUnit where ID = ? LIMIT 1`, [id])
        con.release()

        if (result.length > 0) return ({
            id: result[0].ID,
            name: result[0].full_name,
            email: result[0].email,
            registered: result[0].date_registered,
            ssn: result[0].ssn
        })
        else return null
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
 * 
 * @param {*} email the email from the donor input field
 * @returns 
 */
async function add(email) {
    try {
        var con = await pool.getConnection()
        var res = await con.execute(`INSERT INTO Donors (email) VALUES (?)`, [email])
        con.release()
        return (res[0].insertId)
    }
    catch (ex) {
        con.release()
        throw ex
    }
}

/**
 * 
 * @param {*} email from input field
 * @param {*} name from input field
 * @param {*} ssn from input field
 * @returns 
 */
async function addTaxUnit(email, name, ssn) {
    try {
        var con = await pool.getConnection()
        var res = await con.execute(`INSERT INTO TaxUnit (
            email,
            ssn, 
            full_name
        )  VALUES (?,?,?)`, [email, ssn, name])
        con.release()
        return (res[0].insertId)
    }
    catch(ex) {
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
        let res = await con.query(`UPDATE TaxUnit SET ssn = ? where ID = ?`, [ssn, donorID])
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
    addTaxUnit,
    updateSsn,
    updateNewsletter,

    getTaxUnit,
    getTaxUnitById,

    setup: (dbPool) => { pool = dbPool }
}