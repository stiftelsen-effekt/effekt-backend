const fs = require('fs')

module.exports = {
    //Environment
    env: process.env.NODE_ENV || 'development',
    api_url: process.env.EFFEKT_API_URL,
    minside_url: process.env.MIN_SIDE_URL,

    //Insert db connection values
    db_host: process.env.DB_HOST,
    db_username: process.env.DB_USER,
    db_password: process.env.DB_PASS,
    db_name: process.env.DB_NAME,

    //API keys
    mailgun_api_key: process.env.MAILGUN_API_KEY, 
    mailchimp_api_key: process.env.MAILCHIMP_API_KEY,
    mailchimp_audience_id: process.env.MAILCHIMP_AUDIENCE_ID,

    vipps_client_id: process.env.VIPPS_CLIENT_ID,
    vipps_client_secret: process.env.VIPPS_CLIENT_SECRET,
    vipps_ocp_apim_subscription_key: process.env.VIPPS_OCP_APIM_SUBSCRIPTION_KEY,
    vipps_merchant_serial_number: process.env.VIPPS_MERCHANT_SERIAL_NUMBER,
    vipps_api_url: (process.env.NODE_ENV === 'production' ? 'api.vipps.no' : 'apitest.vipps.no'),

    nets_sftp_server: process.env.NETS_SFTP_SERVER,
    nets_sftp_user: process.env.NETS_SFTP_USER,
    nets_private_key_location: process.env.NETS_SFTP_PRIVATE_KEY_LOCATION,
    nets_sftp_key: (process.env.NETS_SFTP_PRIVATE_KEY_LOCATION ? fs.readFileSync(process.env.NETS_SFTP_PRIVATE_KEY_LOCATION) : process.env.NETS_SFTP_PRIVATE_KEY),
    nets_sftp_key_passphrase: process.env.NETS_SFTP_PRIVATE_KEY_PASSPHRASE,

    //Set port for API listening, default to 3000
    port: process.env.EFFEKT_PORT || process.env.PORT || 3000,

    //Bank account for recieving donations
    bankAccount: process.env.BANK_ACCOUNT,
    nets_customer_id: process.env.NETS_CUSTOMER_ID,

    //Server addresss
    serverAddress: process.env.SERVER_ADDRESS,

    //Ignor authorization requirements for endpoints
    authorizationRequired: (process.env.AUTH_REQUIRED == false ? false : true),

    //Debugging
    debugReturnExceptions: true
}