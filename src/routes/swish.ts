import bodyParser from "body-parser";
import express from "express";
import ipRangeCheck from "ip-range-check";
import {
  SwishPaymentStatuses,
  generatePaymentId,
  generatePaymentReference,
} from "../custom_modules/swish";

const router = express.Router();
const jsonBody = bodyParser.json();

const callbackSwishAllowedIPs = [
  "213.132.115.94", // Swish prod (to be deprecated after July 31)
  "35.228.51.224/28", // Swish prod
  "34.140.166.128/28", // Swish prod
  "89.46.83.171", // Swish test simulation server
];

/**
 * Called by Swish whenever there is a payment update
 */
router.post("/callback", jsonBody, async (req, res) => {
  try {
    const status: string = req.body.status;
    const id: string = req.body.id;

    console.debug(`Swish callback received - id: ${id}, status: ${status}`);

    if (!ipRangeCheck(req.ip, callbackSwishAllowedIPs)) {
      console.warn(`Callback IP was not allowed: ${req.ip}`);
      res.status(403);
      res.send();
      return;
    }

    if (id === undefined || status === undefined) {
      res.status(400);
      res.send();
      return;
    }

    await store.updatePaymentIntentStatus(id, status);

    const info = await store.getPaymentTransactionInfoFromPaymentIntentId(id);
    if (info.donor.email !== undefined) {
      await precacheCredentials();
      const email = new SendGrid({ apiKey: getSendGridApiKey() });

      let emailTemplate;
      if (status === SwishPaymentStatuses.PAID) {
        emailTemplate = config.sendGridTemplateSwishSuccess;
      } else {
        emailTemplate = config.sendGridTemplateSwishFailure;
      }
      email.sendConfirmationEmail(emailTemplate, config.sendGridFromEmail, info);
    }

    res.status(200);
    res.send();
  } catch (err) {
    console.error("Error while processing Swish callback: ", err);
    res.status(500);
    res.send();
  }
});

/**
 * Initiate a new Swish payment request
 */
router.post("/payment-swish", async (req, res) => {
  try {
    res = cors(req, res);
    if (res.statusCode == 204) {
      // HTTP OPTIONS request
      return;
    }

    let info: BackwardsCompatiblePaymentTransactionInfo;
    const id = generatePaymentId();
    const reference = generatePaymentReference();
    const timestamp = new Date();
    let phone = req.body.phone;

    try {
      if (phone === null || phone === undefined) {
        throw new ParameterError("phone", null, "");
      }
      phone = formatPhoneNumberForSwish(phone);
      req.body.phone = phone;

      info = await store.buildPaymentTransactionInfo(
        id,
        "swish",
        "STARTED",
        timestamp,
        reference,
        req,
      );
    } catch (err) {
      if (err instanceof ParameterError) {
        console.debug(`Received request with missing or bad parameter: ${err.param}`);
        res.status(400);
      } else {
        throw err;
      }
      res.send();
      return;
    }

    // this needs to be here because global scope await is not allowed in es6
    await precacheCredentials();

    await store.storeNewPayment(info);

    const swish = new Swish({
      endpoint: config.swishUrl,
      cert: {
        cert: getSwishCert(),
        key: getSwishCertKey(),
        passphrase: "swish",
      },
    });

    const result = await swish.paymentRequest(id, {
      callbackUrl: `${config.serverUrl}/callbackSwish`,
      amount: info.paymentIntent.totalAmount.toString(),
      currency: "SEK",
      payeeAlias: config.swishPayeeAlias,
      payerAlias: phone,
      payeePaymentReference: reference,
    });

    if (result == "OK") {
      res.status(200);
      res.json({ id: id, reference: reference });
    } else {
      await store.updatePaymentIntentStatus(id, "FAILED");
      res.status(500);
    }
    res.send();
  } catch (err) {
    console.error("Error while initiating Swish payment", err);
    res.status(500);
    res.send();
  }
});

module.exports = router;
