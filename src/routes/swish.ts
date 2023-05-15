import bodyParser from "body-parser";
import express, { RequestHandler } from "express";
import ipRangeCheck from "ip-range-check";
import config from "../config";
import { SwishPaymentStatuses } from "../custom_modules/swish";

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
 * Called by Swish whenever there is a payment update
 */
router.post("/callback", jsonBody, swishWhitelistMiddleware, async (req, res) => {
  try {
    const { status, id } = req.body.status;

    console.debug(`Swish callback received - id: ${id}, status: ${status}`);

    if (typeof id !== "string" || typeof status !== "string") {
      res.sendStatus(400);
      return;
    }

    await store.updatePaymentIntentStatus(id, status);

    const info = await store.getPaymentTransactionInfoFromPaymentIntentId(id);
    if (info.donor.email !== undefined) {
      // await precacheCredentials();
      const email = new SendGrid({ apiKey: getSendGridApiKey() });

      let emailTemplate;
      if (status === SwishPaymentStatuses.PAID) {
        emailTemplate = config.sendGridTemplateSwishSuccess;
      } else {
        emailTemplate = config.sendGridTemplateSwishFailure;
      }
      email.sendConfirmationEmail(emailTemplate, config.sendGridFromEmail, info);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error while processing Swish callback: ", err);
    res.sendStatus(500);
  }
});

module.exports = router;
