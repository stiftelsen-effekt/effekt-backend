const morgan = require('morgan')
const chalk = require('chalk')
const process = require('process')

module.exports = function(app) {
    app.use(morgan(
        {
            format:`dev`, 
            stream: { 
                write: function(str) { 
                    console.log(str.substr(0,str.length-1) + ` Worker: ${chalk.red(process.pid)}`)
                }
            }
        }
    ))
}

function padRight(str, len) {
    return len > str.length
        ? str + (new Array(len - str.length + 1)).join(' ')
        : str
}