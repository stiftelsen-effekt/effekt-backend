const fs = require("fs");

const getAllowedProductionOrigins = () => {
  const allowedProductionOriginsEnv = process.env.ALLOWED_PRODUCTION_ORIGINS || "";
  // returns [ '' ] if unset
  return allowedProductionOriginsEnv.split(",");
};

module.exports = {
  //Environment
  env: process.env.NODE_ENV || "development",
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
  vipps_api_url: process.env.NODE_ENV === "production" ? "api.vipps.no" : "apitest.vipps.no",

  swish_cert: process.env.SWISH_CERT,
  swish_cert_key: process.env.SWISH_CERT_KEY,
  swish_payee_alias: process.env.SWISH_PAYEE_ALIAS,
  swish_url: "https://mss.cpc.getswish.net/swish-cpcapi/api/v2",
  swish_whitelist: [
    "213.132.115.94", // Swish prod (to be deprecated after July 31)
    "35.228.51.224/28", // Swish prod
    "34.140.166.128/28", // Swish prod
    "89.46.83.171", // Swish test simulation server
  ],

  nets_sftp_server: process.env.NETS_SFTP_SERVER,
  nets_sftp_user: process.env.NETS_SFTP_USER,
  nets_private_key_location: process.env.NETS_SFTP_PRIVATE_KEY_LOCATION,
  nets_sftp_key: process.env.NETS_SFTP_PRIVATE_KEY_LOCATION
    ? fs.readFileSync(process.env.NETS_SFTP_PRIVATE_KEY_LOCATION)
    : process.env.NETS_SFTP_PRIVATE_KEY,
  nets_sftp_key_passphrase: process.env.NETS_SFTP_PRIVATE_KEY_PASSPHRASE,

  facebook_sync_app_id: process.env.FACBEOOK_SYNC_APP_ID,
  facebook_sync_app_secret: process.env.FACEBOOK_SYNC_APP_SECRET,

  //Set port for API listening, default to 5050
  port: process.env.EFFEKT_PORT || process.env.PORT || "5050",
  //Set host for API listening, default to localhost
  host: process.env.EFFEKT_HOST || process.env.HOST || "localhost",

  //Bank account for recieving donations
  bankAccount: process.env.BANK_ACCOUNT,
  nets_customer_id: process.env.NETS_CUSTOMER_ID,

  //Server addresss
  serverAddress: process.env.SERVER_ADDRESS,

  //Ignor authorization requirements for endpoints
  authorizationRequired: process.env.AUTH_REQUIRED == false ? false : true,

  //Debugging
  debugReturnExceptions: true,

  // Auth0
  authAudience: process.env.AUTH_AUDIENCE,
  authIssuerBaseURL: process.env.AUTH_BASE_URL,
  authUserIdClaim: process.env.AUTH_USER_ID_CLAIM,

  //Prod allowed origins
  allowedProductionOrigins: getAllowedProductionOrigins(),
};
