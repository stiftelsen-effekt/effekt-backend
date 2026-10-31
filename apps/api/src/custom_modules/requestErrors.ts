/**
 * request-promise errors carry the full request options (including credential headers such as
 * client_secret and Ocp-Apim-Subscription-Key) and the raw request. Log this instead of the error.
 */
export const loggableRequestError = (ex: unknown) => {
  if (!(ex instanceof Error) || !("options" in ex)) return ex;
  const { name, message, stack } = ex;
  const { statusCode, error } = ex as { statusCode?: number; error?: unknown };
  return { name, message, statusCode, error, stack };
};

/** Keys whose values never belong in an alert, at any depth. Compared case-insensitively. */
const ALERT_REDACTED_KEYS = new Set([
  "headers",
  "authorization",
  "cookie",
  "set-cookie",
  "ocp-apim-subscription-key",
  "client_id",
  "client_secret",
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "apikey",
  "api_key",
]);

const REDACTED = "[redacted]";

/**
 * Prepares arbitrary data (an exception, request payload, ...) for an alert email or log line:
 * request-promise errors are reduced with loggableRequestError, other errors to name/message,
 * credential-like keys are replaced at any depth, and cycles are cut.
 */
export const redactForAlert = (value: unknown): unknown => {
  const seen = new WeakSet<object>();

  const walk = (current: unknown, depth: number): unknown => {
    if (current instanceof Error) {
      const reduced = loggableRequestError(current);
      if (reduced instanceof Error) {
        const { statusCode, error } = current as { statusCode?: number; error?: unknown };
        current = { name: current.name, message: current.message, statusCode, error };
      } else {
        const { stack, ...rest } = reduced as Record<string, unknown>;
        current = rest;
      }
    }
    if (current === null || typeof current !== "object") return current;
    if (seen.has(current)) return "[circular]";
    if (depth > 8) return "[truncated]";
    seen.add(current);

    if (Array.isArray(current)) return current.map((item) => walk(item, depth + 1));

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(current)) {
      out[key] = ALERT_REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : walk(val, depth + 1);
    }
    return out;
  };

  return walk(value, 0);
};
