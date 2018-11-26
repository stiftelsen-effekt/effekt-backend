var con

//region Get
/**
 * Get payment methods from database
 * @returns {Array} An array of payment method objects
 */
function getMethods() {
    return new Promise(async (async, reject) => {
        try {
            var [res] = await con.query(`SELECT * FROM Payment`)

            if (res.length > 0) {
                fulfill(res.map((method) => {
                    return {
                        id: method.ID,
                        name: method.payment_name,
                        abbriviation: method.abbriv,
                        shortDescription: method.short_desc,
                        flatFee: method.flat_fee,
                        percentageFee: method.percentage_fee,
                        lastUpdated: method.lastUpdated
                    }
                }))
            } else {
                fulfill(null)
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

//endregion

//region Delete
//endregion

module.exports = function(dbPool) {
    con = dbPool

    return {
        
    }
} 