import { Swish_orders } from "@prisma/client";
import { Agent } from "https";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import config from "../config";
import paymentMethods from "../enums/paymentMethods";
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

function isFinalSwishOrderStatus(status: string): status is keyof typeof FinalSwishOrderStatus {
  return status in FinalSwishOrderStatus;
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

  await DAO.swish.updateOrderStatus(order.ID, data.status);

  switch (data.status) {
    case FinalSwishOrderStatus.PAID: {
      const donationID = await DAO.donations.add(
        order.KID,
        paymentMethods.swish,
        data.amount,
        order.registered,
        order.reference,
      );
      await DAO.swish.updateOrderDonationId(order.ID, donationID);
      await sendDonationReceipt(donationID);
      break;
    }
    case FinalSwishOrderStatus.DECLINED:
    case FinalSwishOrderStatus.ERROR: {
      // TODO: Send error mail (https://github.com/stiftelsen-effekt/effekt-backend/issues/552)
    }
  }
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
    status: swishRequest.status,
    amount: swishRequest.amount,
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
