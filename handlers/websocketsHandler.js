//ws is short for websocket(s)

const config = require('./../config.js')
const WebSocket = require('ws')
const uuid = require('uuid/v4')

var clients = []

//Private
function connection(ws) {
    let clientID = uuid()
    clients[clientID] = ws
    send(clientID, clientID) //Notify the client what their ID is
}

//Public
function send(clientID, msg) {
    console.log("Sending msg to client " + clientID + ": " + msg)
    clients[clientID].send(msg)
}

module.exports = function() {
    let server = new WebSocket.Server({ port: config.websocketsPort })
    console.log("Websockets server listening on port " + config.websocketsPort)

    server.on("connection", connection)

    return {
        send
    }
}

