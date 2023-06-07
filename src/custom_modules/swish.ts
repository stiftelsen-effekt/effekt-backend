import { SwishOrder, SwishOrderStatus } from "@prisma/client";
import { Agent } from "https";
import uuid from "uuid/v4";
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
 * https://developer.swish.nu/api/payment-request/v2#payment-request-object
 */
interface SwishPaymentRequest {
  amount: number;
  currency: string;
  callbackUrl: string;
  payerAlias: string;
  payeeAlias: string;
  payeePaymentReference?: string;
  status?: "PAID" | "DECLINED" | "ERROR" | "CANCELLED"; // missing in api docs, but should be there according to examples
}

/**
 * https://developer.swish.nu/api/payment-request/v2#create-payment-request
 * @param data.instructionUUID The identifier of the payment request to be saved. Example: 11A86BE70EA346E4B1C39C874173F088
 * @param data.reference Payment reference of the payee, which is the merchant that receives the payment.
 * @param data.phone The registered cellphone number of the person that makes the payment. It can only contain numbers and has to be at least 8 and at most 15 numbers. It also needs to match the following format in order to be found in Swish: country code + cellphone number (without leading zero). E.g.: 46712345678
 */
async function createPaymentRequest(data: {
  instructionUUID: string;
  amount: number;
  phone: string;
  reference: string;
}) {
  const swishRequestData: SwishPaymentRequest = {
    callbackUrl: `${config.api_url}/swish/callback`,
    amount: data.amount,
    currency: "SEK", // only SEK is supported
    payeeAlias: config.swish_payee_alias,
    payerAlias: data.phone,
    payeePaymentReference: data.reference,
  };

  const options = {
    agent: swishAgent,
    method: "PUT",
    body: JSON.stringify(swishRequestData),
    headers: { "Content-Type": "application/json" },
  };

  const url = new URL(`/api/v2/paymentrequests/${data.instructionUUID}`, config.swish_url);

  console.info(`Starting payment initation - id: ${data.instructionUUID}`);
  console.debug(JSON.stringify(data));
  const res = await fetch(url.toString(), options);
  return { success: res.status === 201, status: res.status };
}

/**
 * https://developer.swish.nu/api/payment-request/v2#retrieve-payment-request
 */
async function retrievePaymentRequest(instructionUUID: string): Promise<SwishPaymentRequest> {
  const options = {
    agent: swishAgent,
    method: "GET",
  };

  const url = new URL(`/api/v1/paymentrequests/${instructionUUID}`, config.swish_url);

  console.info(`Retrieving payment request - id: ${instructionUUID}`);
  const res = await fetch(url.toString(), options);
  return res.json();
}

/**
 * Creates a swish payment request and adds a swish order to the database
 */
export async function initiateOrder(KID: string, data: Pick<SwishPaymentRequest, "amount">) {
  const instructionUUID = generateSwishInstructionUUID();
  const reference = generatePaymentReference();
  const donor = await DAO.donors.getByKID(KID);

  if (!donor.phone) throw new Error("Missing phone number");

  const paymentRequest = await createPaymentRequest({
    instructionUUID,
    amount: data.amount,
    phone: donor.phone,
    reference,
  });

  if (!paymentRequest.success) {
    console.error(`Received non-201 response from Swish - status: ${paymentRequest.status}`);
    throw new Error("Could not initiate payment");
  }

  await DAO.swish.addOrder({
    instructionUUID,
    donorID: donor.id,
    KID,
    reference,
  });
}

/**
 * Updates the status of a swish order in the database.
 * If the status is PAID, a donation is created and a receipt is sent to the donor.
 */
export async function handleOrderStatusUpdate(
  instructionUUID: string,
  data: {
    status: SwishOrderStatus;
    amount: number;
  },
) {
  const order = await DAO.swish.getOrderByInstructionUUID(instructionUUID);

  if (!order) {
    console.error(`Could not find order with instructionUUID: ${instructionUUID}`);
    return;
  }

  if (order.status === data.status) {
    console.info(`Status unchanged, skipping update. Status: ${data.status}`);
    return;
  }

  await DAO.swish.updateOrderStatus(order.ID, data.status);

  switch (data.status) {
    case SwishOrderStatus.PAID: {
      const donationID = await DAO.donations.add(
        order.KID,
        paymentMethods.swish,
        data.amount,
        order.registered,
        order.reference,
      );
      await DAO.swish.updateOrderDonationId(order.ID, donationID);
      await sendDonationReceipt(donationID);
    }
    default: {
      // TODO: Send error mail (https://github.com/stiftelsen-effekt/effekt-backend/issues/552)
    }
  }
}

/**
 * Swish expects exactly this format
 * @example 11A86BE70EA346E4B1C39C874173F088
 */
function generateSwishInstructionUUID() {
  const regex = /-/g;
  return uuid().replace(regex, "").toUpperCase();
}

function generatePaymentReference() {
  const regex = /-/g;
  const random = KID.getRandomNumbers(5);
  const date = new Date().toISOString().substring(2, 10).replace(regex, "");
  return date + random;
}

export async function getSwishOrder(ID: SwishOrder["ID"]) {
  const order = await DAO.swish.getOrder(ID);
  if (!order) return null;
  const swishRequest = await retrievePaymentRequest(order.instructionUUID);
  if (swishRequest.status !== order.status) {
    await handleOrderStatusUpdate(order.instructionUUID, {
      status: swishRequest.status,
      amount: swishRequest.amount,
    });
    return await DAO.swish.getOrder(ID);
  }
  return order;
}
