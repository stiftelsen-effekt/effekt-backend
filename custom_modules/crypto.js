const crypto = require('crypto')

module.exports = {
    /** Gets a random string for use in password reset keys
     *  @returns {string} - A 40 character long hex string
     */
    getPasswordResetKey: function() {
        return crypto.randomBytes(20).toString('hex');
    },

    /** Gets a random string for use in password salts
     *  @returns {string} - A 32 character long hex string
     */
    getPasswordSalt: function() {
        return crypto.randomBytes(16).toString('hex');
    },

    /** Hashes the input with SHA-256
     *  @param {string} password  - The password itself
     *  @param {string} salt - A salt that gets added to the password
     *  @returns {string} - A 56 character long hex string
     */
    hashPassword: function(password, salt) {
        return crypto.createHash('sha256').update(password + salt).digest('hex');
    }
}