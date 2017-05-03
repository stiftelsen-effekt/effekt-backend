const config = require('../config.js')
const request = require('request')

class Mail {
    send(subject, msg, cb) {
        request.post({
            url: 'https://api.mailgun.net/v3/mg.stiftelseneffekt.no/messages',
            auth: {
                user: 'api',
                password: config.mailgun_api_key
            },
            formData: {
                from: 'Excited User <mailgun@mg.stiftelseneffekt.no>',
                to: 'hakon@harnes.me',
                subject: 'Hello',
                text: 'Testing some Mailgun awesomness!'
            }
        }, (err, res, body) => {
            if (err) return cb(err)

            return cb(null, body)
        })
    }
}

module.exports = Mail