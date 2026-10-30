import crypto from "crypto";

const config = require("../config");

/**
 * A short-lived, signed token that registerPendingDonation hands back to the widget with the
 * KID it registered. The widget's follow-up calls (drafting the AvtaleGiro, Vipps or AutoGiro
 * agreement, the bank transfer email, the referral answer) send it back, so they only act on the
 * KID and donor of a registration the same client just made. The token is not encrypted: it
 * only carries what the widget already has (the KID, the method and the amount) and the donor
 * id, which the widget never reads.
 *
 * Format: `v1.<base64url JSON claims>.<base64url HMAC-SHA256>`.
 */

/** How long after registering the widget may use the token */
export const REGISTRATION_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export type RegistrationClaims = {
  /** The KID registered */
  kid: string;
  /** The payment method registered (enums/methods) */
  method: number;
  /** The donor the KID belongs to */
  donorId: number;
  /** The amount registered, in the currency's main unit (NOK, SEK) */
  amount: number;
  /** Expiry, ms since epoch */
  exp: number;
};

const VERSION = "v1";
const DEV_SECRET = "effekt-dev-registration-token-secret";

/**
 * The signing key: WIDGET_REGISTRATION_TOKEN_SECRET when set, otherwise derived (HKDF) from the
 * database password so a deploy without the new variable keeps working. Outside production a
 * fixed development key is used when neither is set; in production that fails closed.
 */
const signingKey = (): Buffer => {
  const explicit: string | undefined = config.widget_registration_token_secret;
  if (explicit) return Buffer.from(explicit, "utf8");

  const base: string | undefined = config.db_password;
  if (base) {
    return Buffer.from(
      crypto.hkdfSync("sha256", base, "effekt-widget", "widget-registration-token-v1", 32),
    );
  }

  if (config.env === "production") {
    throw new Error("WIDGET_REGISTRATION_TOKEN_SECRET is not configured");
  }
  return Buffer.from(DEV_SECRET, "utf8");
};

const sign = (payload: string) =>
  crypto.createHmac("sha256", signingKey()).update(`${VERSION}.${payload}`).digest("base64url");

export function createRegistrationToken(
  claims: Omit<RegistrationClaims, "exp">,
  now: number = Date.now(),
): string {
  const full: RegistrationClaims = { ...claims, exp: now + REGISTRATION_TOKEN_TTL_MS };
  const payload = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${VERSION}.${payload}.${sign(payload)}`;
}

/**
 * The claims of a token this API signed and that has not expired, or null
 */
export function verifyRegistrationToken(
  token: unknown,
  now: number = Date.now(),
): RegistrationClaims | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payload, signature] = parts;

  const expected = Buffer.from(sign(payload), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  let claims: RegistrationClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !claims ||
    typeof claims.kid !== "string" ||
    typeof claims.method !== "number" ||
    typeof claims.donorId !== "number" ||
    typeof claims.amount !== "number" ||
    typeof claims.exp !== "number" ||
    claims.exp < now
  ) {
    return null;
  }
  return claims;
}

/**
 * The claims when the token was issued for this KID and one of these payment methods, else null
 */
export function registrationFor(
  token: unknown,
  KID: string,
  methods: number[],
  now: number = Date.now(),
): RegistrationClaims | null {
  const claims = verifyRegistrationToken(token, now);
  if (!claims || claims.kid !== KID || !methods.includes(claims.method)) return null;
  return claims;
}
