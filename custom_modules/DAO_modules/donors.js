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
//endregion

//region Add
function add(donorObject) {
    return new Promise(async (fulfill, reject) => {
        try {
            var res = await con.execute(`INSERT INTO Donors (
                email,
                full_name
            ) VALUES (?,?,?,?)`, 
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
        add,
        remove
    }
} 