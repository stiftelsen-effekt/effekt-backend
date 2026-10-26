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
