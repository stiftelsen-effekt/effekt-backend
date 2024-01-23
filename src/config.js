const fs = require("fs");
const { join } = require("path");

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
  mailersend_api_key: process.env.MAILERSEND_API_KEY,
  mailchimp_api_key: process.env.MAILCHIMP_API_KEY,
  mailchimp_audience_id: process.env.MAILCHIMP_AUDIENCE_ID,

  //Mailersend templates
  mailersend_donation_receipt_template_id: process.env.MAILERSEND_DONATION_RECEIPT_TEMPLATE_ID,
  mailersend_donation_registered_template_id:
    process.env.MAILERSEND_DONATION_REGISTERED_TEMPLATE_ID,
  mailersend_avtalegiro_notification_template_id:
    process.env.MAILERSEND_AVTALEGIRO_NOTIFICATION_TEMPLATE_ID,

  vipps_client_id: process.env.VIPPS_CLIENT_ID,
  vipps_client_secret: process.env.VIPPS_CLIENT_SECRET,
  vipps_ocp_apim_subscription_key: process.env.VIPPS_OCP_APIM_SUBSCRIPTION_KEY,
  vipps_merchant_serial_number: process.env.VIPPS_MERCHANT_SERIAL_NUMBER,
  vipps_api_url: process.env.NODE_ENV === "production" ? "api.vipps.no" : "apitest.vipps.no",

  swish_cert:
    process.env.SWISH_CERT ||
    (process.env.NODE_ENV === "development"
      ? fs.readFileSync(
          join(__dirname, "..", "certs", "Swish_Merchant_TestCertificate_1234679304.pem"),
          "utf8",
        )
      : undefined),
  swish_cert_key:
    process.env.SWISH_CERT_KEY ||
    (process.env.NODE_ENV === "development"
      ? fs.readFileSync(
          join(__dirname, "..", "certs", "Swish_Merchant_TestCertificate_1234679304.key"),
          "utf8",
        )
      : undefined),
  swish_payee_alias: process.env.SWISH_PAYEE_ALIAS || "1234679304",
  swish_url: process.env.SWISH_CERT
    ? "https://cpc.getswish.net/swish-cpcapi/"
    : "https://mss.cpc.getswish.net/swish-cpcapi/",
  swish_whitelist: [
    // Production https://developer.swish.nu/documentation/environments#production-environment
    "213.132.115.94",
    // Sandbox https://developer.swish.nu/documentation/environments#swish-sandbox
    ...["89.46.83.0/24", "103.57.74.0/24", "77.81.6.112"],
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

  autogiro_customer_number: process.env.AUTOGIRO_CUSTOMER_NUMBER,
  autogiro_bankgiro_number: process.env.AUTOGIRO_BANKGIRO_NUMBER,

  //Server addresss
  serverAddress: process.env.SERVER_ADDRESS,

  //Ignor authorization requirements for endpoints
  authorizationRequired: process.env.AUTH_REQUIRED == false ? false : true,

  //Debugging
  debugReturnExceptions: process.env.NODE_ENV === "development",

  // Auth0
  authAudience: process.env.AUTH_AUDIENCE,
  authIssuerBaseURL: process.env.AUTH_BASE_URL,
  authUserIdClaim: process.env.AUTH_USER_ID_CLAIM,
  authUserMetadataKey: process.env.AUTH_USER_METADATA_KEY,

  //Prod allowed origins
  allowedProductionOrigins: getAllowedProductionOrigins(),
};
