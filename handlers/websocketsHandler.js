//ws is short for websocket(s)

const config = require('./../config.js')
const WebSocket = require('ws')
const uuid = require('uuid/v4')

var clients = []

//Private
function connection(ws) {
    console.log("Connection got ws-argument: " + ws);
    let clientID = uuid()
    clients[clientID] = ws
    send(clientID, clientID) //Notify the client what their ID is
}

//Public
function send(clientID, msg) {
    console.log("Sending msg to client " + clientID + ": " + msg)
    clients[clientID].send(msg)
}

module.exports = function(httpServer) {
    let server = new WebSocket.Server({ server: httpServer })
    console.log("📞 Websockets listening on main http server")

    server.on("connection", connection)

    return {
        send
    }
}

