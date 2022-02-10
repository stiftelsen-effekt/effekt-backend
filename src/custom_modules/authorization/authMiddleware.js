const auth = require('./auth.js')
const { auth, requiredScopes, claimEquals } = require('express-oauth2-jwt-bearer')

const checkJwt = auth({
  audience: 'https://data.gieffektivt.no',
  issuerBaseURL: 'https://konduit.eu.auth0.com/',
});

/**
 * Express middleware, checks if token passed in request grants permission 
 * If api is true, stops the request on fail and sends 401 unathorized
 * If api is false, sets req.authorized to true on success and false on fail, then calls next
 * @param {String} permission Shortname permission
 * @param {Boolean} [api=true] Indicates whether the request is an api request or a view request
 */
const auth = (permission, api = true) => {
  return [checkJwt, requiredScopes(permission)]
}

const checkDonor = (donorId, req, res, next) => {
  const handler = claimEquals("https://konduit.no/user-id", donorId)
  handler(req, res, next)
}

module.exports = {
  auth,
  checkDonor
}