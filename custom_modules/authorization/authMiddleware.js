const auth = require('./auth.js')

/**
 * Express middleware, checks if token passed in request grants permission 
 * If api is true, stops the request on fail and sends 401 unathorized
 * If api is false, sets req.authorized to true on success and false on fail, then calls next
 * @param {String} permission Shortname permission
 * @param {Boolean} [api=true] Indicates whether the request is an api request or a view request
 */
module.exports = (permission, api = true) => {
    return async (req, res, next) => {
        try {
            //Initialize authorized to false and userID to null
            let authorized, userID
            let token = req.token

            if(!token) { 
                res.status(401).json({
                    status: 401,
                    content: "Missing authorization token from request"
                })
                return false
            }

            userID = await auth.checkPermissionByToken(token, permission)
            authorized = (userID != null)

            if (!authorized) {
                if (api) {
                    res.status(401)
                    res.append("error", "invalid_token")
                    res.json({status: 401, content: 'Unauthorized'})
                }
                else {
                    req.authorized = false
                    next()
                }
            } else {
                req.userID = userID
                req.authorized = true
                next()
            }
        } catch(ex) {
            if (ex.message === "invalid_token") {
                res.status(401)
                res.append("error", "invalid_token")
                res.json({status: 401, content: 'Invalid token'})
            }
            else if (ex.message === "insufficient_scope") {
                res.status(401)
                res.append("error", "insufficient_scope")
                res.json({status: 401, content: 'Insufficent scope'})
            }
            else {
                res.status(500).json({
                    status: 500,
                    content: "Internal error during authorization"
                })
            }
        }
    }
}