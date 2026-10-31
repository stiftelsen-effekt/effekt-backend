import { loggableRequestError } from "./requestErrors";
import { DAO } from "./DAO";
import { sendDonationReceipt, sendVippsErrorWarning } from "./mail";

const config = require("./../config");
import crypto from "crypto";
import paymentMethods from "../enums/paymentMethods";
import request from "request-promise-native";
import moment from "moment";
import { pollLoop } from "./pollLoop";

//Timings selected based on the vipps guidelines
//https://www.vipps.no/developers-documentation/ecom/documentation/#polling-guidelines
const POLLING_START_DELAY = 5000;
const POLLING_INTERVAL = 2000;

const VIPPS_TEXT = "Donasjon til Gi Effektivt.";

/**
 * The url code of an agreement fetched from Vipps: the last segment of its merchantAgreementUrl.
 * Older agreements also carry it as their productDescription.
 */
function agreementUrlCodeOf(agreement: {
  merchantAgreementUrl?: string;
  productDescription?: string;
}): string | undefined {
  const fromUrl = agreement.merchantAgreementUrl?.split("/").pop();
  return fromUrl || agreement.productDescription;
}

/** How many days ahead of its due date the daily job creates a charge. */
const CHARGE_DAYS_IN_ADVANCE = 3;

/**
 * How many days a missed charge is caught up. If the daily job did not run (or failed) on the
 * day a charge should have been created, a later run within this many days still creates it.
 */
const CHARGE_CATCH_UP_DAYS = 3;

/**
 * Charge statuses (Vipps recurring v3) that mean the month is already being, or has been,
 * collected. Only FAILED and CANCELLED charges leave the month open for a new charge.
 */
const COLLECTING_CHARGE_STATUSES = new Set([
  "PENDING",
  "DUE",
  "RESERVED",
  "PROCESSING",
  "CHARGED",
  "PARTIALLY_CAPTURED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * Decides whether the daily job should create a charge for an agreement, and for which due date.
 *
 * The due date is always CHARGE_DAYS_IN_ADVANCE days from today. A charge is created when the
 * agreement's scheduled date in that month (its charge day, or the last day of the month for
 * charge day 0) or its force_charge_date falls within the last CHARGE_CATCH_UP_DAYS days up to
 * and including the due date. Catching up a scheduled date that has passed requires the
 * agreement to have existed when that charge should have been created, so a new agreement is
 * not charged earlier than it would have been on its first regular run.
 *
 * Whether the month already has a charge is checked separately (hasChargedDueMonth).
 */
function scheduledChargeDueDate(
  agreement: {
    monthly_charge_day: number;
    force_charge_date?: string | null;
    timestamp_created?: Date | string | null;
  },
  now: Date,
): Date | null {
  const dueDate = addDays(startOfDay(now), CHARGE_DAYS_IN_ADVANCE);
  const windowStart = addDays(dueDate, -CHARGE_CATCH_UP_DAYS);

  const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
  const chargeDay = agreement.monthly_charge_day;
  if (Number.isInteger(chargeDay) && chargeDay >= 0) {
    const scheduled = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      chargeDay === 0 ? lastDayOfMonth : Math.min(chargeDay, lastDayOfMonth),
    );
    if (scheduled.getTime() === dueDate.getTime()) return dueDate;

    if (scheduled >= windowStart && scheduled < dueDate && agreement.timestamp_created) {
      const created = new Date(agreement.timestamp_created);
      const shouldHaveBeenCreatedOn = addDays(scheduled, -CHARGE_DAYS_IN_ADVANCE);
      if (!isNaN(created.getTime()) && created < shouldHaveBeenCreatedOn) return dueDate;
    }
  }

  if (agreement.force_charge_date) {
    const force = new Date(agreement.force_charge_date);
    if (!isNaN(force.getTime())) {
      const forceDay = startOfDay(force);
      if (forceDay >= windowStart && forceDay <= dueDate) return dueDate;
    }
  }

  return null;
}

/**
 * Idempotency key for the scheduled charge of an agreement on a due date, so a rerun of the
 * daily job cannot create a second charge at Vipps. Hex, like the random keys used elsewhere.
 */
function scheduledChargeIdempotencyKey(agreementId: string, formattedDueDate: string): string {
  return crypto
    .createHash("sha256")
    .update(`scheduled-charge:${agreementId}:${formattedDueDate}`)
    .digest("hex")
    .slice(0, 32);
}

const errorMessageOf = (ex: unknown) => (ex instanceof Error ? ex.message : String(ex));

/**
 * @typedef TransactionLogItem
 * @property {number} amount In øre
 * @property {string} transactionText
 * @property {number} transactionId
 * @property {string} timeStamp JSON timestamp
 * @property {string} operation
 * @property {number} requestId
 * @property {boolean} operationSuccess
 */

/**
 * @typedef TransactionSummary
 * @property {number} capturedAmount
 * @property {number} remainingAmountToCapture
 * @property {number} refundedAmount
 * @property {number} remainingAmountToRefund
 * @property {number} bankIdentificationNumber
 */

/**
 *
 * @typedef OrderDetails
 * @property {string} orderId
 * @property {TransactionSummary} transactionSummary
 * @property {Array<TransactionLogItem>} transactionLogHistory
 */

/**
 * @typedef DraftRespone
 * @property {string} agreementResource The REST resource of the agreement
 * @property {string} agreementId The ID of the agreement
 * @property {string} vippsConfirmationUrl URL to confirm the agreement
 * @property {string} chargeId The id of the initial charge
 */

/**
 * @typedef VippsRecurringAgreementCampaign
 * @property {Date} start The start of the campaign price
 * @property {Date} end The end of the campaign price
 * @property {number} campaignPrice The campaign price
 */

/**
 * @typedef VippsRecurringAgreementInitialCharge
 * @property {number} amount Amount in the smallest denomination of the currency, e.g. øre for NOK
 * @property {string} currency A three letter currency code, e.g. NOK
 * @property {string} description
 * @property {"DIRECT_CAPTURE" | "RESERVE_CAPTURE"} transactionType https://github.com/vippsas/vipps-ecom-api/blob/master/vipps-ecom-api-faq.md#what-is-the-difference-between-reserve-capture-and-direct-capture
 */

/**
 * @typedef VippsRecurringAgreement
 * @property {string} currency A three letter currency code, e.g. NOK
 * @property {string} id
 * @property {"DAY" | "WEEK" | "MONTH"} interval The agreement interval type, such as MONTH and DAY
 * @property {number} intervalCount How often to charge per interval type
 * @property {number} price Price in the smallest denomination of the currency, e.g. øre for NOK
 * @property {string} productName
 * @property {string} productDescription
 * @property {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status The status of the agreement
 * @property {Date | null} start When the agreement was started
 * @property {Date | null} stop When the agreement is stopped
 * @property {VippsRecurringAgreementCampaign | undefined} campaign Special campaign pricing of applicable
 * @property {VippsRecurringAgreementInitialCharge | undefined } initialCharge Initial charge for the agreement
 *
 */

/**
 * @typedef VippsRecurringCharge
 * @property {string} id
 * @property {"PENDING" | "DUE" | "CHARGED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "RESERVED" | "CANCELLED" | "PROCESSING"} status
 * @property {string} due Due date
 * @property {number} amount Amount in øre
 * @property {number} amountRefunded Amount refunded in øre
 * @property {string} transactionId
 * @property {string} description
 * @property {"RECURRING" | "INITIAL"} type
 * @property {string} failureReason
 * @property {string} failureDescription
 */

/**
 * @typedef ChargePayload
 * @property {number} amount Amount in the smallest denomination of the currency, e.g. øre for NOK
 * @property {string} currency A three letter currency code, e.g. NOK
 * @property {string} description
 * @property {string} due ISO-8601 date string for due date
 * @property {number} retryDays For how many days vipps shall attempt to retry charge
 * @property {string} orderId The ID of the order
 * @property {string} transactionType The transaction type (either DIRECT_CAPTURE or RESERVE_CAPTURE)
 */

/**
 * @typedef VippsError
 * @property {string} code //https://www.vipps.no/developers-documentation/ecom/documentation/#error-codes
 * @property {string} message
 * @property {string} contextId
 */

module.exports = {
  /**
   * Fetches a fresh access token from the vipps API
   * @return {VippsToken | false} A fresh vipps token or false if failed to fetch
   */
  async fetchToken() {
    try {
      let token = await DAO.vipps.getLatestToken();

      if (!token) {
        let tokenResponse = await request.post({
          uri: `https://${config.vipps_api_url}/accesstoken/get`,
          headers: {
            client_id: config.vipps_client_id,
            client_secret: config.vipps_client_secret,
            "Ocp-Apim-Subscription-Key": config.vipps_ocp_apim_subscription_key,
          },
        });

        tokenResponse = JSON.parse(tokenResponse);

        token = {
          ID: undefined,
          expires: new Date(parseInt(tokenResponse.expires_on) * 1000),
          type: tokenResponse.token_type,
          token: tokenResponse.access_token,
        };
        let tokenId = await DAO.vipps.addToken(token);
        token.ID = tokenId;
      }

      return token;
    } catch (ex) {
      console.error("Failed to fetch vipps token", loggableRequestError(ex));
      throw ex;
    }
  },

  /**
   * @typedef InitiateVippsPaymentResponse
   * @property {string} orderId
   * @property {string} externalPaymentUrl
   */

  /**
   * Initiates a vipps order
   * @param {number} donorPhoneNumber The phone number of the donor
   * @param {VippsToken} token
   * @param {number} sum The chosen donation in NOK
   * @returns {InitiateVippsPaymentResponse} Returns a URL for which to redirect the user to when finishing the payment and the orderId
   */
  async initiateOrder(KID, sum) {
    let token = await this.fetchToken();

    if (token === false) return false;

    let donor = await DAO.donors.getByKID(KID);
    let orderId = `${KID}-${+new Date()}`;
    let order = {
      orderID: orderId,
      donorID: donor!.id,
      KID: KID,
      token: crypto.randomBytes(16).toString("hex"),
    };

    let data = {
      customerInfo: {},
      merchantInfo: {
        authToken: order.token,
        callbackPrefix: `${config.api_url}/vipps/`,
        fallBack: `${config.api_url}/vipps/redirect/${orderId}`,
        isApp: false,
        merchantSerialNumber: config.vipps_merchant_serial_number,
        paymentType: "eComm Regular Payment",
      },
      transaction: {
        amount: sum * 100, //Specified in øre, therefore NOK * 100
        orderId: order.orderID,
        timeStamp: new Date(),
        transactionText: VIPPS_TEXT,
        skipLandingPage: false,
      },
    };

    let initiateRequest = await request.post({
      uri: `https://${config.vipps_api_url}/ecomm/v2/payments`,
      headers: this.getVippsHeaders(token),
      json: data,
    });

    await DAO.vipps.addOrder(order);

    return {
      orderId: order.orderID,
      externalPaymentUrl: initiateRequest.url,
    };
  },

  /**
   * Poll order details
   * @param {string} orderId
   */
  async pollOrder(orderId) {
    await new Promise((resolve) => setTimeout(resolve, POLLING_START_DELAY));
    await pollLoop((polls) => this.checkOrderDetails(orderId, polls), POLLING_INTERVAL);
  },

  /**
   * Checks for updates in the order
   * This is run multiple times from a interval in pollOrder function
   * We keep track of how many attempts we've made, to know whether to cancel the interval
   * @param {string} orderId
   * @param {number} polls How many times have we polled the detail endpoint
   * @returns {boolean} True if we should cancel the polling, false otherwise
   */
  async checkOrderDetails(orderId: string, polls: number): Promise<boolean> {
    console.log(`Polling ${orderId}, ${polls}th poll`);
    let orderDetails = await this.getOrderDetails(orderId);

    //If we've been polling for more than eleven minutes, stop polling for updates
    if (polls * POLLING_INTERVAL + POLLING_START_DELAY > 1000 * 60 * 10) {
      //Update transaction log history with all information we have
      await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory);
      return true;
    }

    let captureLogItem = this.findTransactionLogItem(orderDetails.transactionLogHistory, "CAPTURE");
    let reserveLogItem = this.findTransactionLogItem(orderDetails.transactionLogHistory, "RESERVE");
    if (
      orderDetails.transactionLogHistory.some((logItem) =>
        this.transactionLogItemFinalIsFinalState(logItem),
      )
    ) {
      if (captureLogItem !== null) {
        let KID = orderId.split("-")[0];

        try {
          let donationID = await DAO.donations.add(
            KID,
            paymentMethods.vipps,
            captureLogItem.amount / 100,
            captureLogItem.timeStamp,
            captureLogItem.transactionId,
          );
          await DAO.vipps.updateVippsOrderDonation(orderId, donationID);
          await sendDonationReceipt(donationID);
        } catch (ex) {
          //Donation already registered, no additional actions required
          if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
            console.info("Vipps donation for orderid %s already exists", orderId, ex);
          } else {
            throw ex;
          }
        }
      }

      await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory);

      //We are in a final state, cancel further polling
      return true;
    } else if (reserveLogItem !== null) {
      await this.captureOrder(orderId, reserveLogItem);
    }

    //No final state is reached, keep polling vipps
    return false;
  },

  /**
   * Finds a transaction log item for a given operation, or returns null if none found
   * @param {Array<TransactionLogItem>} transactionLogHistory
   * @param {string} operation
   * @returns {TransactionLogItem | null}
   */
  findTransactionLogItem(transactionLogHistory, operation) {
    let items = transactionLogHistory.filter(
      (logItem) => logItem.operation === operation && logItem.operationSuccess === true,
    );
    if (items.length > 0) return items[0];
    else return null;
  },

  /**
   * Checks wether an item is in a final state (i.e. no actions are longer pending)
   * @param {TransactionLogItem} transactionLogItem
   * @returns
   */
  transactionLogItemFinalIsFinalState(transactionLogItem) {
    if (transactionLogItem.operation === "CAPTURE" && transactionLogItem.operationSuccess === true)
      return true;
    else if (
      transactionLogItem.operation === "CANCEL" &&
      transactionLogItem.operationSuccess === true
    )
      return true;
    else if (
      transactionLogItem.operation === "FAILED" &&
      transactionLogItem.operationSuccess === true
    )
      return true;
    else if (
      transactionLogItem.operation === "REJECTED" &&
      transactionLogItem.operationSuccess === true
    )
      return true;
    else if (
      transactionLogItem.operation === "SALE" &&
      transactionLogItem.operationSuccess === true
    )
      return true;

    return false;
  },

  /**
   * Updates the transaction log history of an order
   * @param {string} orderId
   * @param {Array<TransactionLogItem>} transactionLogHistory
   */
  async updateOrderTransactionLogHistory(orderId, transactionLogHistory) {
    await DAO.vipps.updateOrderTransactionStatusHistory(orderId, transactionLogHistory);
  },

  /**
   * Fetches order details
   * @param {string} orderId
   * @returns {OrderDetails}
   */
  async getOrderDetails(orderId) {
    let token = await this.fetchToken();

    let orderDetails = await request.get({
      uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/details`,
      headers: this.getVippsHeaders(token),
    });

    orderDetails = JSON.parse(orderDetails);

    //convert string timestamp to JS Date in transaction log history
    orderDetails = {
      ...orderDetails,
      transactionLogHistory: orderDetails.transactionLogHistory.map((logItem) => ({
        ...logItem,
        timeStamp: new Date(logItem.timeStamp),
      })),
    };

    return orderDetails;
  },

  /**
   * Captures a order with a reserved amount
   * @param {string} orderId
   * @param {TransactionLogItem} transactionInfo The reserved transaction info
   * @return {boolean} Captured or not
   */
  async captureOrder(orderId, transactionInfo) {
    let token = await this.fetchToken();

    let data = {
      merchantInfo: {
        merchantSerialNumber: config.vipps_merchant_serial_number,
      },
      transaction: {
        amount: transactionInfo.amount,
        transactionText: VIPPS_TEXT,
      },
    };

    try {
      var captureRequest = await request.post({
        uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/capture`,
        headers: this.getVippsHeaders(token),
        json: data,
      });
    } catch (ex) {
      if (ex.statusCode === 423 || ex.statusCode === 402 || ex.error[0].errorCode == 61) {
        //This is most likely a case of the polling trying to capture an order already captured by the callback, simply return true
        return true;
      } else {
        console.error("Failed to capture order with id %s", orderId, loggableRequestError(ex));
        throw ex;
      }
    }

    let KID = orderId.split("-")[0];

    if (captureRequest.transactionInfo.status == "Captured") {
      try {
        let donationID = await DAO.donations.add(
          KID,
          paymentMethods.vipps,
          captureRequest.transactionInfo.amount / 100,
          captureRequest.transactionInfo.timeStamp,
          captureRequest.transactionInfo.transactionId,
        );
        await DAO.vipps.updateVippsOrderDonation(orderId, donationID);
        await sendDonationReceipt(donationID);
        return true;
      } catch (ex) {
        //Donation already registered, no additional actions required
        if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
          console.info("Vipps donation for orderid %s already exists", orderId, ex);
          return true;
        } else {
          throw ex;
        }
      }
    } else {
      //Handle?
      return false;
    }
  },

  /**
   * Refunds an order and deletes the associated donation
   * @param {string} orderId
   * @return {boolean} Refunded or not
   */
  async refundOrder(orderId) {
    let token = await this.fetchToken();

    try {
      let order = await DAO.vipps.getOrder(orderId);
      if (!order) {
        console.error(`Could not refund order with id ${orderId}, order not found in database`);
        return false;
      }

      if (order.donationID == null) {
        console.error(`Could not refund order with id ${orderId}, order has not been captured`);
        return false;
      }

      let donation = await DAO.donations.getByID(order.donationID);

      const data = {
        merchantInfo: {
          merchantSerialNumber: config.vipps_merchant_serial_number,
        },
        transaction: {
          amount: Number(donation.sum) * 100,
          transactionText: VIPPS_TEXT,
        },
      };

      var refundRequest = await request.post({
        uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/refund`,
        headers: this.getVippsHeaders(token),
        json: data,
      });

      await DAO.donations.remove(order.donationID);
      let orderDetails = await this.getOrderDetails(orderId);
      await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory);

      return true;
    } catch (ex) {
      console.error("Failed to refund vipps order with id %s", orderId, loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Cancels order
   * @param {string} orderId
   * @return {boolean} Cancelled or not
   */
  async cancelOrder(orderId) {
    let token = await this.fetchToken();

    try {
      const data = {
        merchantInfo: {
          merchantSerialNumber: config.vipps_merchant_serial_number,
        },
        transaction: {
          transactionText: VIPPS_TEXT,
        },
      };

      var cancelRequest = await request.put({
        uri: `https://${config.vipps_api_url}/ecomm/v2/payments/${orderId}/cancel`,
        headers: this.getVippsHeaders(token),
        json: data,
      });

      let orderDetails = await this.getOrderDetails(orderId);
      await this.updateOrderTransactionLogHistory(orderId, orderDetails.transactionLogHistory);

      return true;
    } catch (ex) {
      console.error("Failed to cancel vipps order with id %s", orderId, loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Approves an order manually (without using the vipps app)
   * Used for integration testing
   * @param {string} orderId
   * @param {string} linkToken Token returned from the vipps api when initating an order
   * @return {boolean} Approved or not
   */
  async approveOrder(orderId, linkToken) {
    if (config.env === "production") return false;

    let token = await this.fetchToken();

    let data = {
      customerPhoneNumber: 93279221,
      token: linkToken,
    };

    try {
      let approveRequest = await request.post({
        uri: `https://${config.vipps_api_url}/ecomm/v2/integration-test/payments/${orderId}/approve`,
        headers: this.getVippsHeaders(token),
        json: data,
      });
      return true;
    } catch (ex) {
      return false;
    }
  },

  /**
   * Drafts an agreement for a recurring payment
   * @param {string} KID KID for organization share
   * @param {number} amount Amount in kroner, not øre
   * @param {number} monthlyChargeDay Monthly charge day
   * @return {DraftRespone | boolean} success
   */
  async draftAgreement(KID, amount, initialCharge, monthlyChargeDay) {
    let token = await this.fetchToken();

    if (token === false) return false;

    if (monthlyChargeDay > 28) monthlyChargeDay = 28;

    // Real price is set in øre
    const realAmount = amount * 100;
    const agreementUrlCode = crypto.randomBytes(16).toString("hex");

    const data = {
      pricing: {
        type: "LEGACY",
        amount: realAmount,
        currency: "NOK",
      },
      interval: {
        unit: "MONTH",
        count: 1,
      },
      isApp: false,
      merchantRedirectUrl: `${config.api_url}/vipps/agreementredirect/${agreementUrlCode}`,
      merchantAgreementUrl: `${config.minside_url}/${agreementUrlCode}`,
      productName: "Månedlig donasjon til Gi Effektivt.",
    };

    if (initialCharge) {
      data["initialCharge"] = {
        amount: realAmount,
        currency: "NOK",
        description: "Første donasjon",
        transactionType: "RESERVE_CAPTURE",
      };
    }

    try {
      /** @type {DraftRespone} */
      let response = await request.post({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements`,
        headers: this.getVippsHeaders(token),
        json: data,
      });

      const donor = await DAO.donors.getByKID(KID);

      if (!donor) {
        console.error(`No donor found with KID ${KID}`);
        return false;
      }

      const addResponse = await DAO.vipps.addAgreement(
        response.agreementId,
        donor.id,
        KID,
        amount,
        monthlyChargeDay,
        agreementUrlCode,
      );

      // If adding to effekt database failed, cancel agreement
      if (addResponse === false) {
        await this.updateAgreementStatus(response.agreementId, "STOPPED");
        await DAO.vipps.updateAgreementStatus(response.agreementId, "STOPPED");

        console.error("Failed adding agreement to database, draft agreement cancelled");
        return false;
      }

      if (response.chargeId) {
        const reservedCharge = await this.getCharge(response.agreementId, response.chargeId);

        if (reservedCharge)
          await DAO.vipps.addCharge(
            response.chargeId,
            response.agreementId,
            amount,
            KID,
            reservedCharge.due,
            reservedCharge.status,
            reservedCharge.type,
          );
      }

      this.pollAgreement(response.agreementId);

      response.agreementUrlCode = agreementUrlCode;
      return response;
    } catch (ex) {
      if (config.env === "production")
        await sendVippsErrorWarning("DRAFT", ex, {
          ...data,
          KID,
          monthlyChargeDay,
        });
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /***
   * Fetches an agreement from vipps by ID
   * @param {number} id The agreement id
   * @returns {VippsRecurringAgreement} The vipps agreement
   */
  async getAgreement(id) {
    let token = await this.fetchToken();

    if (token === false) return false;

    try {
      let agreementRequest = await request.get({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${id}`,
        headers: this.getVippsHeaders(token),
      });

      /** @type {VippsRecurringAgreement} */
      let response = JSON.parse(agreementRequest);

      return response;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /***
   * Fetches all Vipps recurring agreements
   * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status Agreement status
   * @returns {[VippsRecurringAgreement]} Array of agreements
   */
  async getAgreements(status) {
    let token = await this.fetchToken();
    if (token === false) return false;

    const pageSize = 500;
    let page = 1;
    let agreements = [];

    try {
      while (true) {
        // Wait 15 seconds to respect rate limit of 5 requests per minute
        await new Promise((resolve) => setTimeout(resolve, 15000));

        let agreementRequest = await request.get({
          uri: `https://${config.vipps_api_url}/recurring/v3/agreements?status=${status}&pageSize=${pageSize}&pageNumber=${page}`,
          headers: this.getVippsHeaders(token),
        });

        /** @type {[VippsRecurringAgreement]} */
        let response = JSON.parse(agreementRequest);

        agreements = agreements.concat(response);

        if (response.length < pageSize) {
          break;
        }

        page++;
      }

      return agreements;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Updates the price of an agreement
   * @param {string} agreementId The ID of the agreement being updated
   * @param {number} price The new agreement price in øre
   * @return {boolean} Success
   */
  async updateAgreementPrice(agreementId, price) {
    let token = await this.fetchToken();
    if (token === false) return false;

    if (!agreementId || !price) {
      console.error("Missing parameter");
      return false;
    }
    if (price < 100) {
      console.error("Price must be more than 100 øre");
      return false;
    }
    let body = {
      pricing: {
        type: "LEGACY",
        amount: price,
        currency: "NOK",
      },
    };

    try {
      await request.patch({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}`,
        headers: this.getVippsHeaders(token),
        body: JSON.stringify(body),
      });

      return true;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Updates the price of an agreement
   * @param {string} agreementId The ID of the agreement being updated
   * @param {"PENDING" | "ACTIVE" | "STOPPED" | "EXPIRED"} status The new agreement status
   * @return {boolean} Success
   */
  async updateAgreementStatus(agreementId, status) {
    let token = await this.fetchToken();
    if (token === false) return false;

    if (!agreementId || !status) {
      console.error("Missing parameter");
      return false;
    }
    let body = {
      status: status,
    };

    const vippsAgreement = await this.getAgreement(agreementId);
    if (vippsAgreement.status === "STOPPED") {
      console.error("Cannot modify STOPPED agreements");
      return false;
    }

    try {
      await request.patch({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}`,
        headers: this.getVippsHeaders(token),
        body: JSON.stringify(body),
      });
      return true;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Captures a charge created by initialCharge in draftAgreement
   * @param {string} agreementId The agreement id
   * @param {string} chargeId The charge id
   */
  async captureInitalCharge(agreementId, chargeId) {
    const token = await this.fetchToken();
    if (token === false) return false;

    const charge = await this.getCharge(agreementId, chargeId);

    const body = {
      amount: charge.amount,
      description: charge.description,
    };

    try {
      await request.post({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}/charges/${chargeId}/capture`,
        headers: this.getVippsHeaders(token),
        body: JSON.stringify(body),
      });

      return true;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Creates a charge for an agreement
   * @param {string} agreementId The agreement id
   * @param {number} amountKroner The amount to charge in kroner, not øre
   * @param {number} daysInAdvance How many days in advance of the due date
   * @param {Date} dueDate Optional due date, by default 3 days from current date
   * @param {string} idempotencyKey Optional Vipps Idempotency-Key, random by default
   * @return {boolean} Success
   */
  async createCharge(
    agreementId,
    amountKroner,
    daysInAdvance = 3,
    dueDate?: Date,
    idempotencyKey?: string,
  ): Promise<boolean | string> {
    if (daysInAdvance <= 2) {
      console.error("Today must be more than 2 days in advance of the due date");
      return false;
    }

    if (!dueDate) {
      const timeNow = new Date().getTime();
      const dueDateTime = new Date(timeNow + 1000 * 60 * 60 * 24 * daysInAdvance);
      dueDate = new Date(dueDateTime);
    }

    // This is the date format that Vipps accepts
    const formattedDueDate = moment(dueDate).format("YYYY-MM-DD");

    const token = await this.fetchToken();
    if (token === false) return false;

    /** @type {ChargePayload} */
    const data = {
      amount: amountKroner * 100,
      currency: "NOK",
      description: "Fast donasjon til Gi Effektivt.",
      due: formattedDueDate,
      retryDays: 5,
      transactionType: "DIRECT_CAPTURE",
    };

    const headers = this.getVippsHeaders(token, idempotencyKey);

    try {
      const vippsAgreement = await this.getAgreement(agreementId);
      if (vippsAgreement.status !== "ACTIVE") {
        console.error("Agreement status must be ACTIVE to create charges");
        return false;
      }

      const response = await request.post({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}/charges`,
        headers,
        body: JSON.stringify(data),
      });

      const chargeId = JSON.parse(response).chargeId;
      const charge = await this.getCharge(agreementId, chargeId);
      const agreement = await DAO.vipps.getAgreement(agreementId);

      if (!agreement) throw new Error("Agreement not found in database: " + agreementId);

      if (response)
        await DAO.vipps.addCharge(
          chargeId,
          agreementId,
          amountKroner,
          agreement.KID,
          formattedDueDate,
          charge.status,
          "RECURRING",
        );

      return chargeId;
    } catch (ex) {
      if (config.env === "production")
        await sendVippsErrorWarning("CHARGE", ex, {
          ...data,
          agreementId,
        });
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Fetches a single charge
   * @param {string} agreementId The agreement id
   * @param {string} chargeId The charge id
   * @returns {VippsRecurringCharge}
   */
  async getCharge(agreementId, chargeId) {
    const token = await this.fetchToken();
    if (token === false) return false;

    try {
      const response = await request.get({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}/charges/${chargeId}`,
        headers: this.getVippsHeaders(token),
      });

      return JSON.parse(response);
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Fetches the most recent charged charge
   * @param {string} agreementId The agreement id
   * @returns {VippsRecurringCharge}
   */
  async getLastCharge(agreementId) {
    try {
      const charges = await this.getCharges(agreementId);

      if (charges) {
        const chargedCharges = charges.filter((charge) => charge.status === "CHARGED");
        chargedCharges.sort((a, b) =>
          new Date(a.due).getTime() < new Date(b.due).getTime()
            ? 1
            : new Date(b.due).getTime() < new Date(a.due).getTime()
              ? -1
              : 0,
        );
        return chargedCharges[0];
      }
      return false;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Fetches all charges for an agreement
   * @param {string} agreementId The agreement id
   * @returns {[VippsRecurringCharge]} Array of charges
   */
  async getCharges(agreementId) {
    const token = await this.fetchToken();
    if (token === false) return false;

    try {
      const response = await request.get({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}/charges`,
        headers: this.getVippsHeaders(token),
      });

      return JSON.parse(response);
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Gets the closest pending or due future charge
   * @param {string} agreementId The agreement id
   * @returns {Date} The date of the pending charge
   */
  async getPendingDueCharge(agreementId) {
    const charges = await this.getCharges(agreementId);
    let dueCharges: any[] = [];

    try {
      charges.forEach((charge) => {
        if (charge.status === "DUE" || charge.status === "PENDING") dueCharges.push(charge);
      });
      if (dueCharges.length > 0) {
        const sortedByDue = dueCharges.sort((a, b) => (a.due > b.due ? 1 : b.due > a.due ? -1 : 0));
        return sortedByDue[0];
      }
      return false;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Checks if an agreement already has a charge in the month of a new charge that is being, or
   * has been, collected (see COLLECTING_CHARGE_STATUSES). Used to prevent double charging.
   * Throws if the charges cannot be fetched, so the caller does not charge on unknown state.
   * @param {string} agreementId The agreement id
   * @param {Date} newChargeDueDate The date of the new charge
   * @returns {boolean} True if the month of the new charge already has a charge
   */
  async hasChargedDueMonth(agreementId: string, newChargeDueDate: Date) {
    const charges = await this.getCharges(agreementId);
    if (!Array.isArray(charges)) {
      throw new Error(`Could not fetch charges for agreement ${agreementId}`);
    }

    return charges.some((charge) => {
      const chargeDate = new Date(charge.due);
      return (
        newChargeDueDate.getFullYear() === chargeDate.getFullYear() &&
        newChargeDueDate.getMonth() === chargeDate.getMonth() &&
        COLLECTING_CHARGE_STATUSES.has(charge.status)
      );
    });
  },

  /**
   * Cancels a charge
   * @param {string} agreementId The ID of the agreement
   * @param {string} chargeId The ID of the charge being cancelled
   * @return {boolean} Success
   */
  async cancelCharge(agreementId, chargeId) {
    const token = await this.fetchToken();
    if (token === false) return false;

    try {
      await request.delete({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}/charges/${chargeId}`,
        headers: this.getVippsHeaders(token),
      });

      return true;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Refunds a charge
   * @param {string} agreementId The ID of the agreement
   * @param {string} chargeId The ID of the charge being refunded
   * @return {boolean} Success
   */
  async refundCharge(agreementId, chargeId) {
    const token = await this.fetchToken();
    if (token === false) return false;

    const charge = await this.getCharge(agreementId, chargeId);

    // Charge must be paid to be refunded
    if (charge.status !== "CHARGED") return false;

    let body = {
      amount: charge.amount,
      description: "Donasjonen din blir nå refundert",
    };

    try {
      const response = await request.post({
        uri: `https://${config.vipps_api_url}/recurring/v3/agreements/${agreementId}/charges/${chargeId}/refund`,
        headers: this.getVippsHeaders(token),
        body: JSON.stringify(body),
      });

      return true;
    } catch (ex) {
      console.error(loggableRequestError(ex));
      return false;
    }
  },

  /**
   * Poll agreement
   * @param {string} agreementId
   */
  async pollAgreement(agreementId) {
    setTimeout(() => {
      pollLoop((polls) => this.checkAgreement(agreementId, polls), POLLING_INTERVAL);
    }, POLLING_START_DELAY);
  },

  /**
   * This function is polled after an agreement has been drafted, to check whether
   * the user has accepted the agreement.
   * When the agreement is accepted, poll until initial charge (reserve capture) is captured
   * @param {string} agreementId
   * @param {number} polls The number of times we've polled
   * @returns {boolean} True if we should cancel the polling, false otherwise
   */
  async checkAgreement(agreementId, polls) {
    // If we've been polling for more than eleven minutes, stop polling for updates
    if (polls * POLLING_INTERVAL + POLLING_START_DELAY > 1000 * 60 * 10) {
      console.log("Stopped polling checkAgreement for agreementId " + agreementId);
      return true;
    }

    // Agreement from Vipps database
    const vippsAgreement = await this.getAgreement(agreementId);

    if (vippsAgreement.status === "ACTIVE") {
      await DAO.vipps.updateAgreementStatus(agreementId, vippsAgreement.status);

      const initialCharge = await DAO.vipps.getInitialCharge(agreementId);
      const initialChargeID = initialCharge.chargeID;

      // Keep polling until initial charge has been captured
      if (initialChargeID) {
        const isCaptured = await this.captureInitalCharge(agreementId, initialChargeID);

        // Update database and stop polling only if capture was successful
        if (isCaptured) {
          await DAO.vipps.updateChargeStatus("CHARGED", agreementId, initialChargeID);
          return true;
        }
      }
    }

    // Stop polling agreement if it has another status than pending or active
    if (vippsAgreement.status !== "PENDING" && vippsAgreement.status !== "ACTIVE") {
      await DAO.vipps.updateAgreementStatus(agreementId, vippsAgreement.status);
      return true;
    }

    // Keep polling for updates (status = pending)
    return false;
  },

  /**
   * UTIL
   */

  /**
   * Gets vipps authorization headers
   * @param {VippsToken} token
   */
  getVippsHeaders(token, idempotencyKey?: string) {
    return {
      "content-type": "application/json",
      merchant_serial_number: config.vipps_merchant_serial_number,
      "Ocp-Apim-Subscription-Key": config.vipps_ocp_apim_subscription_key,
      Authorization: `${token.type} ${token.token}`,
      "Idempotency-Key": idempotencyKey ?? crypto.randomBytes(16).toString("hex"),
    };
  },

  /**
   * Synchronizes effektDB with agreements and charges from Vipps database
   * Also adds completed charges to Donations table
   * Used in daily schedule
   *
   * Each agreement is synchronized on its own, so one that fails does not stop the rest.
   * @returns The number of agreements fetched and the agreements (or statuses) that failed
   */
  async synchronizeVippsAgreementDatabase(): Promise<{
    agreements: number;
    failed: Array<{ agreementId?: string; status?: string; error: string }>;
  }> {
    const failed: Array<{ agreementId?: string; status?: string; error: string }> = [];
    let agreements: any[] = [];

    // Vipps does not allow fetching all statuses in a single request
    for (const status of ["ACTIVE", "PENDING", "STOPPED", "EXPIRED"]) {
      const fetched = await this.getAgreements(status);
      if (Array.isArray(fetched)) agreements = agreements.concat(fetched);
      else failed.push({ status, error: `Could not fetch ${status} agreements` });
    }

    for (let i = 0; i < agreements.length; i++) {
      try {
        const anonDonorId = 1464;
        const standardKID = 87397824;
        const chargeDay = 1;
        const chargeAmount = agreements[i].pricing.amount;

        // Adds agreement if it does not exist in effektDB (with default values)
        await DAO.vipps.addAgreement(
          agreements[i].id,
          anonDonorId,
          standardKID,
          chargeAmount / 100,
          chargeDay,
          agreementUrlCodeOf(agreements[i]),
          agreements[i].status,
        );

        await DAO.vipps.updateAgreementPrice(agreements[i].id, chargeAmount / 100);
        await DAO.vipps.updateAgreementStatus(agreements[i].id, agreements[i].status);

        const agreement = await DAO.vipps.getAgreement(agreements[i].id);
        if (!agreement) throw new Error("Agreement not found in database");

        const charges = await this.getCharges(agreements[i].id);
        if (!Array.isArray(charges)) throw new Error("Could not fetch charges");

        for (let j = 0; j < charges.length; j++) {
          // Adds charge if it does not exist in effektDB
          await DAO.vipps.addCharge(
            charges[j].id,
            agreements[i].id,
            charges[j].amount / 100,
            agreement.KID,
            charges[j].due,
            charges[j].status,
            charges[j].type,
          );
          await DAO.vipps.updateChargeStatus(charges[j].status, agreements[i].id, charges[j].id);

          if (charges[j].status === "CHARGED") {
            const charge = await DAO.vipps.getCharge(agreements[i].id, charges[j].id);
            const paymentMethod = 8;
            const dayOfMonth = new Date().getDate();
            const thisMonth = new Date().getMonth();
            let registeredDate = charge.dueDate;
            const externalPaymentId = `${agreements[i].id}.${charges[j].id}`;
            const metaOwnerId = 3;

            // If a charge has failed on the last day of a month, set registeredDate to current day
            // This prevents charges being incorrectly registered as paid in the previous month
            if (dayOfMonth >= 2 && new Date(charge.dueDate).getMonth() < thisMonth) {
              registeredDate = new Date();
            }

            const donationExists = await DAO.donations.externalPaymentIDExists(
              externalPaymentId,
              paymentMethod,
            );

            if (!donationExists) {
              // Add completed charges to Donations table (externalPaymentId is a unique column and prevents duplicate insertions)
              const donationId = await DAO.donations.add(
                charge.KID,
                paymentMethod,
                charges[j].amount / 100,
                registeredDate,
                externalPaymentId,
                metaOwnerId,
              );

              if (donationId) {
                await sendDonationReceipt(donationId);
              } else {
                console.error(
                  `Failed to add donation with externalPaymentId ${externalPaymentId}, no receipt sent`,
                );
              }
            }
          }

          if (charges[j].status === "REFUNDED") {
            // TODO: Update donation sum to 0
          }
        }
      } catch (ex) {
        console.error(`Failed to synchronize Vipps agreement ${agreements[i]?.id}`);
        console.error(loggableRequestError(ex));
        failed.push({ agreementId: agreements[i]?.id, error: errorMessageOf(ex) });
      }
    }

    return { agreements: agreements.length, failed };
  },

  /**
   * Creates the charges that fall due CHARGE_DAYS_IN_ADVANCE days from now, catching up charges
   * missed in the last CHARGE_CATCH_UP_DAYS days (see scheduledChargeDueDate).
   * Each agreement is handled on its own, so one that fails does not stop the rest.
   * Used in daily schedule
   */
  async createFutureDueCharges(now: Date = new Date()): Promise<{
    activeAgreements: number;
    createdCharges: number;
    failed: Array<{ agreementId: string; error: string }>;
  }> {
    const failed: Array<{ agreementId: string; error: string }> = [];
    const activeAgreements = await DAO.vipps.getActiveAgreements();

    if (!activeAgreements || activeAgreements.length === 0) {
      return { activeAgreements: 0, createdCharges: 0, failed };
    }

    let chargeCount = 0;

    for (const agreement of activeAgreements) {
      try {
        const dueDate = scheduledChargeDueDate(agreement as any, now);
        if (!dueDate) continue;

        // Both columns are nullable; an invalid pause ending date is treated as not paused
        const pauseEnd = agreement.paused_until_date as string;
        if (!(new Date(pauseEnd) < now || isNaN(Date.parse(pauseEnd)))) continue;

        // Check if agreement is also active in Vipps database
        const vippsAgreement = await this.getAgreement(agreement.ID);
        if (!vippsAgreement) throw new Error("Could not fetch agreement from Vipps");
        if (vippsAgreement.status !== "ACTIVE") continue;

        if (await this.hasChargedDueMonth(agreement.ID, dueDate)) continue;

        const formattedDueDate = moment(dueDate).format("YYYY-MM-DD");
        console.log(
          "Creating charge due " + formattedDueDate + " for agreement " + vippsAgreement.id,
        );

        const chargeId = await this.createCharge(
          vippsAgreement.id,
          vippsAgreement.pricing.amount / 100,
          CHARGE_DAYS_IN_ADVANCE,
          dueDate,
          scheduledChargeIdempotencyKey(vippsAgreement.id, formattedDueDate),
        );
        if (!chargeId) throw new Error("Could not create charge due " + formattedDueDate);

        chargeCount += 1;
      } catch (ex) {
        console.error(`Failed to create charge for Vipps agreement ${agreement.ID}`);
        console.error(loggableRequestError(ex));
        failed.push({ agreementId: agreement.ID, error: errorMessageOf(ex) });
      }
    }

    return {
      activeAgreements: activeAgreements.length,
      createdCharges: chargeCount,
      failed,
    };
  },

  scheduledChargeDueDate,
  scheduledChargeIdempotencyKey,
};
