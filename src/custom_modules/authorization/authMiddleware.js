const auth = require('./auth.js')
const { auth, requiredScopes, claimEquals, claimIncludes, claimCheck } = require('express-oauth2-jwt-bearer');
const DAO = require('../DAO.js');
const authorizationRoles = require('../../enums/authorizationRoles.js');

const checkJwt = auth({
  audience: 'https://data.gieffektivt.no',
  issuerBaseURL: 'https://gieffektivt.eu.auth0.com/',
});

const roleClaim = "https://gieffektivt.no/roles"
const useridClaim = "https://gieffektivt.no/user-id"

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
  const handler = claimCheck((claims) => claims[roleClaim].includes('admin') || claims[useridClaim] === donorId)
  handler(req, res, next)
}

const checkAvtaleGiroAgreement = (KID, req, res, next) => {
  DAO.donors.getByKID(KID).then(donor => {
    const handler = claimCheck((claims) => claims[roleClaim].includes('admin') || claims[useridClaim] === donor.id)
    handler(req, res, next)
  }).catch(err => {{
    next(new Error("Failed to verify ownershop of agreement"))
  }});
}

const isAdmin = [checkJwt, claimIncludes('permissions', authorizationRoles.admin)]

module.exports = {
  auth,
  checkDonor,
  checkAvtaleGiroAgreement,
  isAdmin
}