const config = require('../config.js')

const template = require('./template.js')

const request = require('request')
const fs = require('fs')

class Mail {
    send(options, cb) {
        console.log(options)
        fs.readFile(appRoot + '/mail_templates/' + options.templateName + "/index.html", 'utf8', (err, templateHtml) => {
            if (err) {
                cb('Error reading mail template')
                return console.log(err)
            }

            var templateHTML = template(templateHtml, options.templateData)

            request.post({
                url: 'https://api.mailgun.net/v3/mg.stiftelseneffekt.no/messages',
                auth: {
                    user: 'api',
                    password: config.mailgun_api_key
                },
                formData: {
                    from: 'Stifelsen Effekt <mailgun@mg.stiftelseneffekt.no>',
                    to: options.reciever,
                    subject: 'Hello',
                    text: 'Your mail client does not support HTML email',
                    html: templateHTML
                }
            }, (err, res, body) => {
                if (err) return cb(err)

                return cb(null, body)
            })
        })
    }
}

module.exports = Mail