//Get
function getKIDByEmail(email) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.execute(`SELECT * FROM Donors where email = ?`, [email])
        } catch (ex) {
            reject(ex)
        }

        if (result.length > 0) fulfill(result[0].KID)
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

//Add
function add(userObject) {
    return new Promise(async (fulfill, reject) => {
        try {
            var res = await con.execute(`INSERT INTO Donors (
                KID,
                email,
                first_name,
                last_name
            ) VALUES (?,?,?,?)`, 
            [
                userObject.KID,
                userObject.email,
                userObject.firstName,
                userObject.lastName
            ])
        }
        catch(ex) {
            return reject(ex)
        }
        
        fulfill(res[0].insertId)
    })
}

//Modify

//Delete
function remove(userID) {
    return new Promise(async (fulfill, reject) => {
        reject(new Error("Not implemented"))
    })
}

module.exports =  {
    getByID,
    getKIDByEmail,
    add,
    remove
}