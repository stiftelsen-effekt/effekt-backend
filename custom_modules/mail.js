const config = require('../config.js')

const template = require('./template.js')

const request = require('request-promise-native')
const fs = require('fs-extra')

module.exports = {
    send: async function(options) {
        const templateRoot = appRoot + '/mail_templates/' + options.templateName

        var templateRawHTML = await fs.readFile(templateRoot + "/index.html", 'utf8')
        var templateHTML = template(templateRawHTML, options.templateData)

        var data = {
            from: 'GiEffektivt.no <mailgun@mg.stiftelseneffekt.no>',
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

        return await request.post({
            url: 'https://api.mailgun.net/v3/mg.stiftelseneffekt.no/messages',
            auth: {
                user: 'api',
                password: config.mailgun_api_key
            },
            formData: data
        })
    }
}