module.exports = {
    db_connection_string: process.env.db_connection_string, //Insert mongoDB connection string
    mailgun_api_key: process.env.mailgun_api_key, //Insert mailgun API key
    port: process.env.PORT || 3000
}