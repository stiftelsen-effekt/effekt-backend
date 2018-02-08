module.exports = {
    //Insert db connection values
    db_host: "localhost",
    db_username: "gieffektivt",
    db_password: "Schistoernodritt!",
    db_name: "EffektDonasjonDB",

    //Insert mailgun API key
    mailgun_api_key: "key-23847af8816b2f2a1535fed0368f2b72", 

    //Set port for API listening, default to 3000
    port: process.env.PORT || 3000,

    //Set port for websockets listening, default to 8080
    websocketsPort: process.env.WS_PORT || 8080,

    //Bank account for recieving donations
    bankAccount: "1503.74.03269",

    //Server addresss
    serverAddress: "91.225.63.22",

    //Security
    ssl: true,

    //Debugging
    debugReturnExceptions: true
}