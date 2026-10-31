import bodyParser from "body-parser";
import express, { RequestHandler } from "express";
import ipRangeCheck from "ip-range-check";
import config from "../config";
import * as swish from "../custom_modules/swish";

const router = express.Router();
const jsonBody = bodyParser.json();

const swishWhitelistMiddleware: RequestHandler = (req, res, next) => {
  if (!ipRangeCheck(req.ip!, config.swish_whitelist)) {
    console.warn(`Swish request from non-whitelisted IP: ${req.ip}`);
    res.sendStatus(403);
    return;
  }
  next();
};

router.get("/qr/:token", async (req, res, next) => {
  try {
    const { token } = req.params;
    const format = "png";
    const stream = await swish.streamQrCode(token, { format });
    res.type(format);
    stream.pipe(res);
  } catch (err) {
    console.error("Error while fetching QR: ", err);
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

router.post("/callback", jsonBody, swishWhitelistMiddleware, async (req, res, next) => {
  try {
    // Only the payment request id is taken from the callback. The status and amount are
    // re-fetched from Swish, so a forged callback cannot mark an order as paid.
    const { id } = (req.body ?? {}) as Partial<SwishCallbackRequestBody>;
    await swish.handleCallback(id);
    res.sendStatus(200);
  } catch (err) {
    console.error("Error while processing Swish callback: ", err);
    next(err);
  }
});

export default router;
