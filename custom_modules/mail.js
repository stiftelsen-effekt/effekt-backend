const config = require('../config.js')
const DAO = require('./DAO.js')

const template = require('./template.js')

const request = require('request-promise-native')
const fs = require('fs-extra')

module.exports = {
    /* 
    @param donationID int
    */
    sendDonationReciept,
    /* 
    @param KID int
    @param sum int
    */
    sendDonationRegistered
}

async function sendDonationReciept(donationID) {
    try {
        var donation = await DAO.donations.getByID(donationID)
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

    let organizations = split.map(function(org) {
        var amount = donation.sum * parseFloat(org.percentage_share) * 0.01
        var roundedAmount = (amount > 1 ? Math.round(amount) : 1)

        return {
          name: org.full_name,
          //Add thousand seperator regex at end of amount
          amount: (roundedAmount != amount ? "~ " : "") + roundedAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
          percentage: parseFloat(org.percentage_share)
        }
      })

    send({
        reciever: donation.mail,
        subject: "GiEffektivt.no - Din donasjon er mottatt",
        templateName: "reciept",
        templateData: {
            header: "Hei " + donation.donorName + ",",
            donationSum: donation.sum,
            organizations: organizations
        }
    })
}


async function sendDonationRegistered(KID, sum) {
    try {
      var KIDstring = donationObject.KID.toString()
      //Add seperators for KID, makes it easier to read
      KIDstring = KIDstring.substr(0,3) + " " + KIDstring.substr(3,2) + " " + KIDstring.substr(5,3)
  
      await send({
        subject: 'GiEffektivt.no - Donasjon klar for innbetaling',
        reciever: recieverEmail,
        templateName: 'registered',
        templateData: {
          header: "Hei, " + (recieverName.length > 0 ? recieverName : ""),
          //Add thousand seperator regex at end of amount
          donationSum: donationObject.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
          kid: KIDstring,
          accountNumber: config.bankAccount,
          organizations: donationObject.split.map(function(split) {
            var amount = donationObject.amount * split.share * 0.01
            var roundedAmount = (amount > 1 ? Math.round(amount) : 1)
  
            return {
              name: split.name,
              //Add thousand seperator regex at end of amount
              amount: (roundedAmount != amount ? "~ " : "") + roundedAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
              percentage: split.share
            }
          })
        }
      })
    }
    catch(ex) {
        console.error("Failed to send mail donation registered")
        console.log(ex)
    }
}

/*
@param  options {
            reciever: string,
            subject: string,
            templateName: string, //Name of html template for 
            templateData: object //Object with template data on the form {key: value, key2: value2 ...}
        }
*/
async function send(options) {
    const templateRoot = appRoot + '/views/mail/' + options.templateName

    var templateRawHTML = await fs.readFile(templateRoot + "/index.html", 'utf8')
    var templateHTML = template(templateRawHTML, options.templateData)

    var data = {
        from: 'Stiftelsen Effekt <mailgun@mg.stiftelseneffekt.no>',
        to: options.reciever,
        subject: options.subject,
        text: 'Your mail client does not support HTML email',
        html: templateHTML,
        inline: []
    }

    var filesInDir = await fs.readdir(templateRoot + "/images/")
    for (var i = 0; i < filesInDir.length; i++) {
        data.inline.push(fs.createReadStream(templateRoot + "/images/" + filesInDir[i]))
    }

    console.log(options)
    console.log(config)
    console.log(data)

    return await request.post({
        url: 'https://api.mailgun.net/v3/mg.stiftelseneffekt.no/messages',
        auth: {
            user: 'api',
            password: config.mailgun_api_key
        },
        formData: data
    })
}