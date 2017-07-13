/*

module.exports = {
    //Insert db connection values
    db_host: process.env.db_host,
    db_username: process.env.db_username,
    db_password: process.env.db_password,
    db_name: process.env.db_name,

    //Insert mailgun API key
    mailgun_api_key: process.env.mailgun_api_key, 

    //Set port for API listening, default to 3000
    port: process.env.PORT || 3000
}

*/

module.exports = {
    //Insert db connection values
    db_host: "91.225.63.22",
    db_username: "gieffektivt",
    db_password: "Schistoernodritt!",
    db_name: "EffektDonasjonDB",

    //Insert mailgun API key
    mailgun_api_key: process.env.mailgun_api_key, 

    //Set port for API listening, default to 3000
    port: process.env.PORT || 3000
}