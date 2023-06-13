import bodyParser from "body-parser";
import express, { RequestHandler } from "express";
import ipRangeCheck from "ip-range-check";
import config from "../config";
import * as swish from "../custom_modules/swish";

const router = express.Router();
const jsonBody = bodyParser.json();

const swishWhitelistMiddleware: RequestHandler = (req, res, next) => {
  if (!ipRangeCheck(req.ip, config.swish_whitelist)) {
    console.warn(`Swish request from non-whitelisted IP: ${req.ip}`);
    res.sendStatus(403);
    return;
  }
  next();
};

/**
 * @openapi
 * /swish/orders/{KID}:
 *    get:
 *      tags: [Swish]
 *      description: Fetches a Swish order by id
 *    parameters:
 *      - in: path
 *        name: KID
 *        required: true
 *        description: KID of the swish order to fetch.
 *        schema:
 *          type: string
 *    responses:
 *      200:
 *        description: Swish order
 *        content:
 *          application/json:
 *            schema:
 *              - type: object
 *                properties:
 *                  KID:
 *                    type: string
 *                  status:
 *                    type: string
 */
router.get("/orders/:KID", async (req, res, next) => {
  try {
    const { KID } = req.params;
    const order = await swish.getSwishOrder(KID);
    if (!order) return res.sendStatus(404);
    res.json({
      KID: order.KID,
      status: order.status,
    });
  } catch (err) {
    console.error("Error while fetching payment request: ", err);
    next(err);
  }
});

interface SwishCallbackRequestBody {
  id: string;
  amount: number;
  currency: string;
  callbackUrl: string;
  payerAlias: string;
  payeeAlias: string;
  paymentReference: string;
  status: "PAID" | "DECLINED" | "ERROR" | "CANCELLED";
  dateCreated: string;
  datePaid?: string;
  errorCode?: string;
  errorMessage?: string;
  additionalInformation?: string;
}

/**
 * @openapi
 * /swish/callback:
 *    post:
 *      tags: [Swish]
 *      description: Called by Swish whenever there is a payment update
 *
 * @see https://developer.swish.nu/documentation/guides/create-a-payment-request#handling-the-callback
 */
router.post("/callback", jsonBody, swishWhitelistMiddleware, async (req, res, next) => {
  try {
    const { status, amount, id } = req.body as SwishCallbackRequestBody;
    await swish.handleOrderStatusUpdate(id, { status, amount });
    res.sendStatus(200);
  } catch (err) {
    console.error("Error while processing Swish callback: ", err);
    next(err);
  }
});

export default router;
