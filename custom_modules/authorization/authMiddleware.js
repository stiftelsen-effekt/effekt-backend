const auth = require('./auth.js')

/**
 * Express middleware, checks if token passed in request grants permission 
 * If api is true, stops the request on fail and sends 401 unathorized
 * If api is false, sets req.authorized to true on success and false on fail, then calls next
 * @param {String} permission Shortname permission
 * @param {Boolean} api Indicates whether the request is an api request or a view request
 */
module.exports = (permission, api = true) => {
    return async (req, res, next) => {
        try {
            if (!api) api = true;

            let token = req.query.token

            let authorized = await auth.checkPermissionByToken(token, permission)

            if (!authorized) {
                if (api) res.status(401).json({status: 401, content: 'Unauthorized'})
                else {
                    req.authorized = false
                    next()
                }
            } else {
                req.authorized = true
                next()
            }
        } catch(ex) {
            res.status(500).json({
                status: 500,
                content: "Internal error during authorization"
            })
        }
    }
}