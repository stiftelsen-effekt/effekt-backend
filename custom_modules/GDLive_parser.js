var http = require("http")
var https = require("https")

var config = {
    feedItemsToFetch: 2
};

// select * from htmlstring where url='https://live.givedirectly.org' and xpath='//div[@class="card recipient-card"]'
// var yql = "https://query.yahooapis.com/v1/public/yql?q=SELECT%20*%20FROM%20htmlstring%20WHERE%20url%3D%22https%3A%2F%2Flive.givedirectly.org%22%20and%20xpath%3D%22%2F%2Fdiv%5B%40id%3D'recipient-cards'%5D%2Fdiv%22%20%7C%20truncate(count%3D3)&format=json&diagnostics=true&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=";

//var yql = "https://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20htmlstring%20where%20url%3D'https%3A%2F%2Flive.givedirectly.org'%20and%20xpath%3D'%2F%2Fdiv%5Bcontains(%40id%2C%22recipient-cards%22)%5D%2Fchild%3A%3Adiv%5Bposition() <= 2%5D'&format=json&diagnostics=true&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=";

var yql = "/v1/public/yql?q=select%20*%20from%20htmlstring%20where%20url%3D'https%3A%2F%2Flive.givedirectly.org'%20and%20xpath%3D'%2F%2Fdiv%5Bcontains(%40id%2C%22recipient-cards%22)%5D%2Fchild%3A%3Adiv%5Bposition() <= 2%5D'&format=json&diagnostics=true&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback="

var defaultOptions = {
    host: 'query.yahooapis.com',
    port: 443,
    path: yql,
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

function onResult(statusCode, obj) {
    console.log(statusCode, obj)
}

function getJSON(options=defaultOptions) {
    console.log("getJSON");
    
    var port = options.port == 443 ? https : http;
    var req = port.request(options, function(res)
    {
        var output = '';
        console.log(options.host + ':' + res.statusCode);
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
            var obj = JSON.parse(output);
            onResult(res.statusCode, obj);
            return obj
        });
    });

    req.on('error', function(err) {
        //res.send('error: ' + err.message);
    });

    req.end();
}

module.exports = {
    getJSON,
}