module.exports = {

    //Insert db connection values

    db_host: process.env.DB_HOST,

    db_username: process.env.DB_USER,

    db_password: process.env.DB_PASS,

    db_name: process.env.DB_NAME,



    //Insert mailgun API key

    mailgun_api_key: process.env.MAILGUN_API_KEY, 



    //Set port for API listening, default to 3000

    port: process.env.EFFEKT_PORT || 3000,



    //Set port for websockets listening, default to 8080

    websocketsPort: process.env.EFFEKT_WS_PORT || 8080,



    //Bank account for recieving donations

    bankAccount: process.env.BANK_ACCOUNT,



    //Server addresss

    serverAddress: process.env.SERVER_ADDRESS,



    //Security, default to false for development

    ssl: process.env.SSL || false,



    //Debugging

    debugReturnExceptions: true

}