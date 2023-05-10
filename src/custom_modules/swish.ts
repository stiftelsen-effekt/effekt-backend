import uuid from "uuid/v4";
import { KID } from "./KID";

interface SwishPaymentBase {
  amount: string;
  currency: string;
  callbackUrl: string;
  payerAlias: string;
  payeeAlias: string;
}

interface SwishPaymentRequest extends SwishPaymentBase {
  payeePaymentReference?: string;
}

interface SwishPaymentResponse extends SwishPaymentBase {
  id: string;
  paymentReference: string;
  status: string;
  dateCreated: string;
  datePaid?: string;
  errorCode?: string;
  errorMessage?: string;
  additionalInformation?: string;
}

interface SwishError {
  errorCode: string;
  errorMessage: string;
  additionalInformation: string;
}

export enum SwishPaymentStatuses {
  PAID = "PAID",
  DECLINED = "DECLINED",
  ERROR = "ERROR",
  CANCELLED = "CANCELLED",
}
/**
 * Request a payment (E-commerce only)
 *
 * @param  {PaymentRequestType} data
 * @returns Promise
 */
export function paymentRequest(id: string, data: SwishPaymentRequest): Promise<string> {
  const url = `${opts.endpoint}/paymentrequests/${id}`;
  const options = {
    agent: new Agent({
      ...this.opts.cert,
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
    }),
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  };

  console.info(`Starting payment initation - id: ${id}`);
  console.debug(JSON.stringify(data));

  return fetch(url, options).then(handleResponse).catch(handleError);
}

async function handleResponse(res: any) {
  if (res.status === 201) {
    return "OK";
  }
  console.error(`Received non-201 response from Swish - status: ${res.status}`);
  console.error(`Message: ${JSON.stringify(res)}`);
  return "ERROR";
}

function handleError(err: Error) {
  console.error("Error while initiating payment request to Swish: ", err);
  return "ERROR";
}

/**
 * Some phone numbers from frontend input could contain a leading 0 after the country code
 * which will cause the Swish payment to fail
 * Required format: 467XXXXXXXX
 * @param phone
 */
export function formatPhoneNumberForSwish(phone: string): string {
  if (phone.startsWith("4607")) {
    return "467" + phone.substring(4);
  }
  return phone;
}

// Swish expects exactly this format
export function generatePaymentId(): string {
  const regex = /-/g;
  return uuid().replace(regex, "").toUpperCase();
}

export function generatePaymentReference(): string {
  const regex = /-/g;
  const random = KID.getRandomNumbers(5);
  const date = new Date().toISOString().substring(2, 10).replace(regex, "");
  return date + random;
}
