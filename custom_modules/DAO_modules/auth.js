var con

//region Get
function getUserByChangePassKey(key) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [result] = await con.execute(`SELECT * FROM ChangePass where key = ?`, [email])
        } catch (ex) {
            reject(ex)
        }

        if (result.length > 0) fulfill(result[0].ID)
        else fulfill(null)
    })
}
//endregion

//region Add
//endregion

//region Modify
//endregion

//region Delete
//endregion

module.exports = function(dbPool) {
    con = dbPool

    return {

    }
} 