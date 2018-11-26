var con

//region Get
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
 * @return {array} An array of donor objects
 */
function search(query) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.execute(`SELECT * FROM Donors WHERE MATCH (full_name, email) AGAINST (?)`, [query])
        } catch(ex) {
            reject(ex)
        }

        if (result.length > 0) fulfill(result.map((donor) => {
            return {
                id: donor.ID,
                name: donor.full_name,
                email: donor.email
            }
        }))
        else fulfill(null)
    })
}
//endregion

//region Add
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
function remove(userID) {
    return new Promise(async (fulfill, reject) => {
        reject(new Error("Not implemented"))
    })
}
//endregion

module.exports = function(dbPool) {
    con = dbPool

    return {
        getByID,
        getIDbyEmail,
        search,
        add,
        remove
    }
} 