import crypto from "crypto";

const config = require("../config");

/**
 * Verifies the HMAC-SHA256 signature on an incoming Vipps webhook request.
 * See https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/request-authentication/
 *
 * @returns true if the request is authentic, false otherwise
 */
export function verifyVippsWebhookSignature(
  method: string,
  pathAndQuery: string,
  headers: {
    "x-ms-date": string;
    "x-ms-content-sha256": string;
    host: string;
    authorization: string;
  },
  rawBody: string,
): boolean {
  const secret = config.vipps_recurring_webhook_secret;
  if (!secret) {
    console.error("VIPPS_RECURRING_WEBHOOK_SECRET is not configured");
    return false;
  }

  const expectedContentHash = crypto.createHash("sha256").update(rawBody).digest("base64");

  if (headers["x-ms-content-sha256"] !== expectedContentHash) {
    console.warn("Vipps webhook content hash mismatch");
    return false;
  }

  const signedString =
    `${method}\n` +
    `${pathAndQuery}\n` +
    `${headers["x-ms-date"]};${headers["host"]};${headers["x-ms-content-sha256"]}`;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedString)
    .digest("base64");

  const expectedAuth = `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${expectedSignature}`;

  if (headers["authorization"] !== expectedAuth) {
    console.warn("Vipps webhook authorization header mismatch");
    return false;
  }

  return true;
}
