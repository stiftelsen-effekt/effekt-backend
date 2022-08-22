const config = require('./../config')
const DAO = require('./DAO')
const request = require('request-promise-native')
const donorHelper = require('./donorHelper')

/**
 * Adds a donor to the mailinglist
 * @param {number} donorID
 */
async function subscribeDonor(donorID) {
    try {
        var donor = await DAO.donors.getByID(donorID)
    } catch(ex) {
        console.error(`Could not fetch donor with id ${donorID}`)
        console.error(ex)
        return false
    }
    
    try {
        let firstname = donorHelper.getFirstname(donor)
        let lastname = donorHelper.getLastname(donor)

        let res = await request.post({
                url: `/3.0/lists/${config.mailchimp_audience_id}/members/`,
                data: {
                    email_address: "urist.mcvankab@freddiesjokes.com",
                    status: "subscribed",
                    merge_fields: {
                        "FNAME": firstname,
                        "LNAME": lastname
                    }
                },
                auth: {
                    user: 'gieffektivt_api', 
                    pass: config.mailchimp_api_key
                }
            })

        if (res.data && res.data.subscribed == true) return true
        else {
            console.error(res)
            return false
        }
    } catch(ex) {
        console.error(`Error communicating with the mailchimp API for donor ${donorID}`)
        console.error(ex)
        return false
    }
}

module.exports = {
    subscribeDonor
}