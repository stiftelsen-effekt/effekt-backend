const config = require('../config.js')
const DAO = require('./DAO.js')
const moment = require('moment')

const template = require('./template.js')

const request = require('request-promise-native')
const fs = require('fs-extra')

module.exports = {
    sendDonationReciept,
    sendDonationRegistered
}

/**
 * Sends a donation reciept
 * @param {number} donationID
 * @param {string} reciever Reciever email
*/
async function sendDonationReciept(donationID, reciever = null) {
    try {
        var donation = await DAO.donations.getByID(donationID)
        if (!donation.email)  {
          console.error("No email provided for donatin ID " + donationID)
          return false
        }
    } catch(ex) {
        console.error("Failed to send mail donation reciept, could not get donation by ID")
        console.error(ex)
        return false
    }

    try {
      var split = await DAO.distributions.getSplitByKID(donation.KID)
    } catch (ex) {
      console.error("Failed to send mail donation reciept, could not get donation split by KID")
      console.error(ex)
      return false
    }

    let organizations = formatOrganizationsFromSplit(split, donation.sum)

    try {
      await send({
        reciever: (reciever ? reciever : donation.email),
        subject: "gieffektivt.no - Din donasjon er mottatt",
        templateName: "reciept",
        templateData: {
            header: "Hei " + donation.donor + ",",
            //Add thousand seperator regex at end of amount
            donationSum: donation.sum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
            organizations: organizations,
            donationDate: moment(donation.timestamp).format("DD.MM YYYY"),
            paymentMethod: donation.method 
        }
      })

      return true
    } catch(ex) {
      console.error("Failed to send donatin reciept")
      console.error(ex)
      return ex.statusCode
    }
    
}

function formatOrganizationsFromSplit(split, sum) {
  return split.map(function(org) {
    var amount = sum * parseFloat(org.percentage_share) * 0.01
    var roundedAmount = (amount > 1 ? Math.round(amount) : 1)

    return {
      name: org.full_name,
      //Add thousand seperator regex at end of amount
      amount: (roundedAmount != amount ? "~ " : "") + roundedAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
      percentage: parseFloat(org.percentage_share)
    }
  })
}

/** 
 * @param {number} KID 
 * @param {number} sum
*/
async function sendDonationRegistered(KID, sum) {
    try {
      try {
        var donor = await DAO.donors.getByKID(KID)
      } catch(ex) {
        console.error("Failed to send mail donation reciept, could not get donor by KID")
        console.error(ex)
        return false
      }

      if (!donor) {
        console.error(`Failed to send mail donation reciept, no donors attached to KID ${KID}`)
        return false
      }

      try {
        var split = await DAO.distributions.getSplitByKID(KID)
      } catch(ex) {
        console.error("Failed to send mail donation reciept, could not get donation split by KID")
        console.error(ex)
        return false
      }

      let organizations = formatOrganizationsFromSplit(split, sum)

      var KIDstring = KID.toString()
      //Add seperators for KID, makes it easier to read
      KIDstring = KIDstring.substr(0,3) + " " + KIDstring.substr(3,2) + " " + KIDstring.substr(5,3)
  
      await send({
        subject: 'gieffektivt.no - Donasjon klar for innbetaling',
        reciever: donor.email,
        templateName: 'registered',
        templateData: {
          header: "Hei, " + (donor.name.length > 0 ? donor.name : ""),
          name: donor.name,
          //Add thousand seperator regex at end of amount
          donationSum: sum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
          kid: KIDstring,
          accountNumber: config.bankAccount,
          organizations: organizations
        }
      })

      return true
    }
    catch(ex) {
        console.error("Failed to send mail donation registered")
        console.log(ex)
        return ex.statusCode
    }
}

/**
 * @typedef MailOptions
 * @prop {string} reciever
 * @prop {string} subject
 * @prop {string} templateName Name of html template, found in views folder
 * @prop {object} templateData Object with template data on the form {key: value, key2: value2 ...}
*/

/**
 * Sends a mail to 
 * @param {MailOptions} options 
 * @returns {boolean | number} True if success, status code else
 */
async function send(options) {
    const templateRoot = appRoot + '/views/mail/' + options.templateName

    var templateRawHTML = await fs.readFile(templateRoot + "/index.html", 'utf8')
    var templateHTML = template(templateRawHTML, options.templateData)

    var data = {
        from: 'gieffektivt.no <donasjon@gieffektivt.no>',
        to: options.reciever,
        bcc: "donasjon@gieffektivt.no",
        subject: options.subject,
        text: 'Your mail client does not support HTML email',
        html: templateHTML,
        inline: []
    }

    var filesInDir = await fs.readdir(templateRoot + "/images/")
    for (var i = 0; i < filesInDir.length; i++) {
        data.inline.push(fs.createReadStream(templateRoot + "/images/" + filesInDir[i]))
    }

    //Exceptions bubble up
    await request.post({
        url: 'https://api.mailgun.net/v3/mg.stiftelseneffekt.no/messages',
        auth: {
            user: 'api',
            password: config.mailgun_api_key
        },
        formData: data
    })
}