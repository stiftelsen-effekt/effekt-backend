const config = require('../config.js')

module.exports = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err)
    }

    console.log(err.ex) //Log the error

    if (!err.status) err.status = 500
    if (!err.msg) err.msg = "Internal server error"
    if (config.debugReturnExceptions) err.msg = err.ex

    res.status(err.status).json({
        status: err.status,
        content: err.msg
    })
}