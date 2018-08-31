const DAO = require('../DAO.js')

module.exports = {
    /**
     * Check whether token gives permission specified
     * @param {String} token An access token
     * @param {String} permission Shortname of a permission
     * @returns {Boolean} 
     */
    checkPermissionByToken: async function(token, permission) {
        return await DAO.auth.getCheckPermissionByToken(token, permission)
    }
}