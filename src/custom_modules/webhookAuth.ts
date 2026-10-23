import crypto from "crypto";
import { RequestHandler } from "express";

/**
 * Constant-time string comparison. Both values are hashed first so that the comparison
 * does not leak the length of the expected value.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Middleware that requires the Authorization header to carry a shared secret, either as
 * the raw value or as "Bearer <secret>". Fails closed (401) when the secret is not configured.
 *
 * @param getSecret Returns the configured secret (read lazily so tests / config can change it)
 * @param envName   Name of the env var, used in the log message when it is missing
 */
export function requireAuthorizationSecret(
  getSecret: () => string | undefined,
  envName: string,
): RequestHandler {
  return (req, res, next) => {
    const secret = getSecret();
    if (!secret) {
      console.error(`${envName} is not configured, rejecting webhook request to ${req.path}`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const header = req.get("authorization") || "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;

    if (!provided || !safeEqual(provided, secret)) {
      console.warn(`Rejected webhook request to ${req.path}: invalid authorization`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }
    next();
  };
}

/**
 * Middleware that verifies a MailerSend webhook signature: the "Signature" header is the
 * hex encoded HMAC-SHA256 of the raw request body, keyed with the webhook's signing secret.
 * See https://developers.mailersend.com/api/v1/webhooks.html#security
 * Requires req.rawBody (captured by the express.json verify hook in server.ts).
 * Fails closed (401) when the secret is not configured.
 */
export function requireMailerSendSignature(
  getSecret: () => string | undefined,
  envName: string,
): RequestHandler {
  return (req: any, res, next) => {
    const secret = getSecret();
    if (!secret) {
      console.error(`${envName} is not configured, rejecting webhook request to ${req.path}`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const signature = req.get("signature") || "";
    const rawBody: string | undefined = req.rawBody;
    if (!signature || typeof rawBody !== "string") {
      console.warn(`Rejected webhook request to ${req.path}: missing signature or body`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    if (!safeEqual(signature.toLowerCase(), expected)) {
      console.warn(`Rejected webhook request to ${req.path}: invalid signature`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }
    next();
  };
}
