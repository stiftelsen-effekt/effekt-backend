module.exports = {
    //Environment
    env: process.env.NODE_ENV || 'development',

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

    //Set port for API listening, default to 3000
    port: process.env.PORT || 3000,

    //Bank account for recieving donations
    bankAccount: process.env.BANK_ACCOUNT,

    //Server addresss
    serverAddress: process.env.SERVER_ADDRESS,

    //Ignor authorization requirements for endpoints
    authorizationRequired: (process.env.AUTH_REQUIRED == false ? false : true),

    //Debugging
    debugReturnExceptions: true
}