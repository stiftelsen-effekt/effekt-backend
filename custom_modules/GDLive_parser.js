var http = require("http")
var https = require("https")
var he = require('he')

var config = {
    feedItemsToFetch: 2,
    currencyApiKey: "fd654297fe844f97a06ffb450c33147d",
    exchangeRate: 8 //NOK per USD
};

function getOptions(number) {
    var yql = `/v1/public/yql?q=select%20*%20from%20htmlstring%20where%20url%3D'https%3A%2F%2Flive.givedirectly.org'%20and%20xpath%3D'%2F%2Fdiv%5Bcontains(%40id%2C%22recipient-cards%22)%5D%2Fchild%3A%3Adiv%5Bposition()<=${number}%5D'&format=json&diagnostics=true&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=`
    return {
        host: 'query.yahooapis.com',
        port: 443,
        path: yql,
        method: 'GET',
    }
}

//region Exchange rates
function getExchangeRate() {
    return new Promise((resolve, reject) => {
        var req = https.request(options = {
            host: 'openexchangerates.org',
            path: '/api/latest.json?app_id=fd654297fe844f97a06ffb450c33147d&base=USD',
            method: 'GET',
        }, res => {
            var output = '';
            console.log(options.host + ':' + res.statusCode)
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                output += chunk;
            })

            res.on('end', function() {
                var obj = JSON.parse(output)
                resolve(obj.rates.NOK)
            })
        })

        req.on('error', function(err) {
            res.send('error: ' + err.message)
        })

        req.end()
    })
}

async function setExchangeRate() {
    config.exchangeRate = await getExchangeRate()
    console.log("Exhcange rate satt til " + config.exchangeRate)
}

setInterval(setExchangeRate, 24 * 60 * 60 * 1000)
//endregion

//region Parsing
function onResult(statusCode, obj, resolve) {
    var htmlString = obj.query.results.result
    var htmlSplit = htmlString.split(/>\s+<|[<>]/)
    var json = {}

    //Exctract links
    var linksRegex = /\/newsfeed\/[a-z0-9\-]+\/\d+\?\w+=\w+#\w+_\d+/g
    var links = htmlSplit.filter(entry => {
        return linksRegex.exec(entry)
    })
    links = links.map(current => {
        var result = linksRegex.exec(current)
        return result ? result[0] : result
    })
    links = links.filter(current => { return current })
    links = links.map(current => {
        return "https://live.givedirectly.com" + current
    })

    //Exctract time
    //TODO: lagre som datetime, returnere som fornuftig tekst
    var timeRegex = /[\\n\s]+\d+\s(minutes?|hours?|days?)\sago[\\n\s]+/g
    times = htmlSplit.filter(current => {
        return timeRegex.exec(current)
    })
    
    times = times.map(current => {
        return current.replace(/\\n/g, "").trim()
    })

    times = times.map(current => {
        if (current.includes("minute")) {
            var date = new Date()
            date.setMinutes(date.getMinutes() - Number.parseInt(/\d+/.exec(current)[0]))
            return date
        }
        else if (current.includes("hour")) {
            var date = new Date()
            date.setHours(date.getHours() - Number.parseInt(/\d+/g.exec(current)[0]))
            return date
        } else if (current.includes("day")) {
            var date = new Date()
            date.setDays(date.getDays() - Number.parseInt(/\d+/.exec(current)[0]))
            return date
        }
        return current
    })

    times = times.map(current => {
        // TODO: kan få 0 dager og timer, i teorien
        var now = new Date()
        var diff = now.getTime() - current.getTime()
        if (diff >= 24 * 60 * 60 * 1000) {
            var days = Math.ceil(diff / (24 * 60 * 60 * 1000))
            return `${days} dag${days == 1 ? "" : "er"} siden`
        } else if (diff >= 60 * 60 * 1000) {
            var hours = Math.ceil(diff / (60 * 60 * 1000))
            return `${hours} time${hours == 1 ? "" : "r"} siden`
        } else {
            var minutes = Math.ceil(diff / (60 * 1000))
            return `${minutes} minutt${minutes == 1 ? "" : "er"} siden`
        }
    })



    //Exctract payment
    var paymentRegex = /[\\n\s]+received a \$(\d+)\s\w+\spayment\.?[\\n\s]+/g
    payments = htmlSplit.filter(current => {
        return paymentRegex.exec(current)
    })

    payments = payments.map(current => {
        return /\$(\d+)/g.exec(current)[1]
    })

    payments = payments.map(current => {
        return current * config.exchangeRate
    })
    
    //Extract text
    //TODO: Entities fortsatt wonky
    var found = 0
    var padding = 0
    var texts = []
    while (found != -1) {
        found = htmlSplit.slice(padding).findIndex(element => {
            return element.includes("survey-answer-small")
        })
        if (found != -1) {
            padding += found + 1
            texts.push(htmlSplit[padding])
        }
    }

    texts = texts.map(current => {
        return current.replace(/\\n/g, "").trim()
    })

    // Decodes HTML entities, for example &amp;
    texts = texts.map(current => {
        return he.decode(current)
    })

    //Extract image
    //TODO: alt-tekst
    var imageRegex = /^img.*src="([a-z0-9:\/\-\._]+)"/g
    images = htmlSplit.filter(current => {
        return imageRegex.exec(current)
    })

    images = images.map(current => {
        return /https?:\/\/[a-z0-9\/\._-]+/g.exec(current)[0]
    })

    
    //Bygg JSON
    var jsonObjekt = {}
    try {
        var num = links.length
        for (i = 0; i < num; i++) {
            jsonObjekt[i] = {
                link: links[i],
                time: times[i],
                payment: payments[i],
                image: images[i],
                text: texts[i],
            }
        }
    } catch (ex) {
        jsonObjekt = {error: ex}
    }

    resolve(jsonObjekt)
}
//endregion

function getJSON(number) {
    return new Promise((resolve, reject) => {
        var options = getOptions(number)
        var port = options.port == 443 ? https : http
        var req = port.request(options, function(res)
        {
            var output = ''
            console.log(options.host + ':' + res.statusCode)
            res.setEncoding('utf8')

            res.on('data', function (chunk) {
                output += chunk
            })

            res.on('end', function() {
                var obj = JSON.parse(output)
                onResult(res.statusCode, obj, resolve)
            })
        })

        req.on('error', function(err) {
            res.send('error: ' + err.message)
        })

        req.end()
    })
}

module.exports = {
    getJSON,
}