import crypto from "crypto";
import { RequestHandler } from "express";

/**
 * Constant-time string comparison. Both values are hashed first so that the comparison
 * does not leak the length of the expected value.
 */
function safeEqual(a: string, b: string): boolean {
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

/** How far a Sanity webhook's signed timestamp may be from now */
const SANITY_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Middleware that verifies a Sanity GROQ webhook signature: the "sanity-webhook-signature" header
 * is `t=<timestamp ms>,v1=<signature>`, where the signature is the base64url HMAC-SHA256 of
 * `<timestamp>.<raw body>` keyed with the webhook's secret (as @sanity/webhook signs it).
 * Requests signed more than five minutes from now are refused, so a captured request can't be
 * replayed later. Requires req.rawBody. Fails closed (401) when the secret is not configured.
 */
export function requireSanityWebhookSignature(
  getSecret: () => string | undefined,
  envName: string,
): RequestHandler {
  return (req: any, res, next) => {
    const secret = getSecret();
    if (!secret) {
      console.error(`${envName} is not configured, rejecting webhook request to ${req.path}`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const header = req.get("sanity-webhook-signature") || "";
    const match = /^t=(\d+),v1=([A-Za-z0-9_-]+)$/.exec(header.trim());
    const rawBody: string | undefined = req.rawBody;
    if (!match || typeof rawBody !== "string") {
      console.warn(`Rejected webhook request to ${req.path}: missing signature or body`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const [, timestamp, signature] = match;
    if (Math.abs(Date.now() - Number(timestamp)) > SANITY_SIGNATURE_TOLERANCE_MS) {
      console.warn(`Rejected webhook request to ${req.path}: signature timestamp out of range`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("base64url");
    if (!safeEqual(signature, expected)) {
      console.warn(`Rejected webhook request to ${req.path}: invalid signature`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }
    next();
  };
}
