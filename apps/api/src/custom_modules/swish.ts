import { Swish_orders } from "@prisma/client";
import { Agent } from "https";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import config from "../config";
import { DAO } from "./DAO";
import { KID } from "./KID";
import { sendDonationReceipt } from "./mail";

const swishAgent = new Agent({
  cert: config.swish_cert,
  key: config.swish_cert_key,
  passphrase: "swish",
  minVersion: "TLSv1.2",
  maxVersion: "TLSv1.2",
});

/**
 * @see https://developer.swish.nu/api/payment-request/v2#payment-request-object
 */
interface SwishPaymentRequest {
  amount: number;
  currency: "SEK";
  callbackUrl: string;
  payeeAlias: string;
  payeePaymentReference?: string;
  ageLimit?: string;
  /** When the payment was paid, e.g. 2015-02-19T22:01:53+01:00 */
  datePaid?: string;
  status?: string; // missing in api docs, but should be there according to examples
}

/**
 * @see https://developer.swish.nu/documentation/guides/create-a-payment-request#if-the-payment-is-successful
 */
enum FinalSwishOrderStatus {
  PAID = "PAID",
  DECLINED = "DECLINED",
  ERROR = "ERROR",
  CANCELLED = "CANCELLED",
}

function isFinalSwishOrderStatus(
  status: string | null,
): status is keyof typeof FinalSwishOrderStatus {
  return status !== null && status in FinalSwishOrderStatus;
}

/**
 * @param data.instructionUUID The identifier of the payment request to be saved. Example: 11A86BE70EA346E4B1C39C874173F088
 * @param data.reference Payment reference of the payee, which is the merchant that receives the payment.
 *
 * @see https://developer.swish.nu/api/payment-request/v2#create-payment-request
 */
async function createPaymentRequest(data: {
  instructionUUID: string;
  amount: number;
  reference: string;
}) {
  const swishRequestData: SwishPaymentRequest = {
    callbackUrl: new URL("/swish/callback", config.api_url).toString(),
    amount: data.amount,
    currency: "SEK", // only SEK is supported
    payeeAlias: config.swish_payee_alias,
    payeePaymentReference: data.reference,
  };

  const url = new URL(
    `/swish-cpcapi/api/v2/paymentrequests/${data.instructionUUID}`,
    config.swish_url,
  );

  console.info(`Starting payment initation - id: ${data.instructionUUID}`);

  const res = await fetch(url, {
    agent: swishAgent,
    method: "PUT",
    body: JSON.stringify(swishRequestData),
    headers: { "Content-Type": "application/json" },
  });
  const success = res.status === 201;
  if (!success) {
    const body = await res.json();
    console.error("Swish payment initiation failed", body);
  }
  return { success, status: res.status, token: res.headers.get("paymentrequesttoken") };
}

/**
 * @see https://developer.swish.nu/api/payment-request/v2#retrieve-payment-request
 */
async function retrievePaymentRequest(instructionUUID: string): Promise<SwishPaymentRequest> {
  const options = {
    agent: swishAgent,
    method: "GET",
  };

  const url = new URL(`/swish-cpcapi/api/v1/paymentrequests/${instructionUUID}`, config.swish_url);

  console.info(`Retrieving payment request - id: ${instructionUUID}`);
  const res = await fetch(url.toString(), options);
  return res.json();
}

/**
 * Creates a swish payment request and adds a swish order to the database
 */
export async function initiateOrder(KID: string, data: { amount: number }) {
  const instructionUUID = generateSwishInstructionUUID();
  const reference = generatePaymentReference();
  const donor = await DAO.donors.getByKID(KID);

  if (!donor) {
    throw new Error(`Could not find donor with KID: ${KID}`);
  }

  const paymentRequest = await createPaymentRequest({
    instructionUUID,
    amount: data.amount,
    reference,
  });

  if (!paymentRequest.success) {
    console.error(`Received non-201 response from Swish - status: ${paymentRequest.status}`);
    throw new Error("Could not initiate payment");
  }

  const orderID = await DAO.swish.addOrder({
    instructionUUID,
    donorID: donor.id,
    KID,
    reference,
  });

  return {
    orderID,
    paymentRequestToken: paymentRequest.token,
  };
}

/**
 * Updates the status of a swish order in the database.
 * If the status is PAID, a donation is created and a receipt is sent to the donor.
 */
export async function handleOrderStatusUpdate(
  instructionUUID: string,
  data: {
    status: string;
    amount: number;
    datePaid?: string;
  },
) {
  const order = await DAO.swish.getOrderByInstructionUUID(instructionUUID);

  if (!order) {
    console.error(`Could not find order with instructionUUID: ${instructionUUID}`);
    return;
  }

  if (isFinalSwishOrderStatus(order.status)) {
    console.info(`Order status already final, skipping update. Status: ${order.status}`);
    return;
  }

  if (order.status === data.status) {
    console.info(`Status unchanged, skipping update. Status: ${data.status}`);
    return;
  }

  console.info(`Updating order status - id: ${order.ID}, status: ${data.status}`);

  if (data.status === FinalSwishOrderStatus.PAID) {
    // The donation and the PAID status are written together, so a failed insert leaves the
    // order open for the next callback or poll, and two concurrent updates record it once
    const donationID = await DAO.swish.completePaidOrder(order.ID, {
      amount: data.amount,
      timestamp: paidTimestamp(data.datePaid),
    });
    if (donationID === null) {
      console.info(`Order already completed by another request - id: ${order.ID}`);
      return;
    }
    try {
      await sendDonationReceipt(donationID);
    } catch (ex) {
      console.error("Failed to send receipt for Swish donation %s", donationID, ex);
    }
    return;
  }

  await DAO.swish.updateOrderStatus(order.ID, data.status);
  // TODO: Send error mail on DECLINED / ERROR (https://github.com/stiftelsen-effekt/effekt-platform/issues/552)
}

/**
 * The donation's timestamp: when Swish says it was paid, or now. (The order's `registered`
 * column is filled by the DB clock, which is not UTC; see docs/timestamps.md.)
 */
function paidTimestamp(datePaid: string | undefined): Date {
  if (datePaid) {
    const date = new Date(datePaid);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

/**
 * Handles a Swish payment request callback.
 *
 * The callback body is not authenticated (Swish does not sign callbacks), so it is only used
 * to identify which payment request changed. The status and amount are fetched from the
 * Swish API over mTLS, the same way the status polling in getSwishOrder does.
 */
export async function handleCallback(instructionUUID: unknown) {
  if (typeof instructionUUID !== "string" || !/^[0-9A-F]{32}$/.test(instructionUUID)) {
    console.warn("Swish callback with invalid payment request id");
    return;
  }

  const order = await DAO.swish.getOrderByInstructionUUID(instructionUUID);
  if (!order) {
    console.error(`Could not find order with instructionUUID: ${instructionUUID}`);
    return;
  }

  if (isFinalSwishOrderStatus(order.status)) {
    console.info(`Order status already final, skipping update. Status: ${order.status}`);
    return;
  }

  const swishRequest = await retrievePaymentRequest(instructionUUID);
  if (typeof swishRequest?.status !== "string" || typeof swishRequest?.amount !== "number") {
    throw new Error(`Could not retrieve Swish payment request ${instructionUUID}`);
  }

  await handleOrderStatusUpdate(instructionUUID, {
    status: swishRequest.status,
    amount: swishRequest.amount,
    datePaid: swishRequest.datePaid,
  });
}

/**
 * Swish expects exactly this format
 *
 * @see https://developer.swish.nu/documentation/guidelines#uuid-description
 * @example 11A86BE70EA346E4B1C39C874173F088
 */
function generateSwishInstructionUUID() {
  const regex = /-/g;
  return uuidv4().replace(regex, "").toUpperCase();
}

/**
 * The payee payment reference sent to Swish. It is not unique (random digits); the donation's
 * external ID is the instruction UUID.
 */
function generatePaymentReference() {
  const regex = /-/g;
  const random = KID.getRandomNumbers(5);
  const date = new Date().toISOString().substring(2, 10).replace(regex, "");
  return date + random;
}

export async function getSwishOrder(ID: Swish_orders["ID"]) {
  const order = await DAO.swish.getOrderByID(ID);
  if (!order) return null;
  if (isFinalSwishOrderStatus(order.status)) return order;

  const swishRequest = await retrievePaymentRequest(order.instructionUUID);
  if (swishRequest.status === order.status) return order;

  await handleOrderStatusUpdate(order.instructionUUID, {
    status: swishRequest.status!,
    amount: swishRequest.amount,
    datePaid: swishRequest.datePaid,
  });
  return await DAO.swish.getOrderByID(ID);
}

/** https://swish-developer-docs.web.app/api/qr-codes/v1#mcom-to-qcom */
export async function streamQrCode(token: string, options: { format: "png" }) {
  const response = await fetch(`https://mpc.getswish.net/qrg-swish/api/v1/commerce`, {
    body: JSON.stringify({
      token,
      size: "300",
      format: "png",
      border: "0",
      transparent: true,
    }),
    headers: {
      "Content-Type": "application/json",
    },

    method: "POST",
  });

  return response.body;
}
