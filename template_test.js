const template = require('custom_modules/template.js')

fs.readFile(appRoot + '/mail_templates/' + options.templateName + "/index.html", 'utf8', (err, templateHtml) => {
            if (err) {
                cb('Error reading mail template')
                return console.log(err)
            }

            var templateHTML = template(templateHtml, options.templateData)

            console.log(templateHTML)
})