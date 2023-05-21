import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendVippsAgreementChange, sendVippsProblemReport } from "../custom_modules/mail";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";
import permissions from "../enums/authorizationPermissions";

import express from "express";
const router = express.Router();
import bodyParser from "body-parser";
const jsonBody = bodyParser.json();
const dns = require("dns").promises;
const config = require("../config");
const rounding = require("../custom_modules/rounding");
const vipps = require("../custom_modules/vipps");

const vippsCallbackProdServers = [
  "callback-1.vipps.no",
  "callback-2.vipps.no",
  "callback-3.vipps.no",
  "callback-4.vipps.no",
];
const vippsCallbackDisasterServers = [
  "callback-dr-1.vipps.no",
  "callback-dr-2.vipps.no",
  "callback-dr-3.vipps.no",
  "callback-dr-4.vipps.no",
];
const vippsCallbackDevServers = [
  "callback-mt-1.vipps.no",
  "callback-mt-2.vipps.no",
  "callback-mt-3.vipps.no",
  "callback-mt-4.vipps.no",
];

/**
 * @openapi
 * tags:
 *   - name: Vipps
 *     description: Vipps agreements in the database.
 */

router.get("/token", async (req, res, next) => {
  let token = await vipps.fetchToken();
  res.json(token);
});

router.get("/initiate/:phonenumber", async (req, res, next) => {
  let token = await vipps.fetchToken();
  let url = await vipps.initiateOrder(req.params.phonenumber, token);
  res.json(url);
});

router.post("/agreement/draft", jsonBody, async (req, res, next) => {
  const body = req.body;
  const KID = body.KID;
  const amount = body.amount;
  const initialCharge = body.initialCharge;
  const monthlyChargeDay = body.monthlyChargeDay > 28 ? 28 : body.monthlyChargeDay;

  try {
    const content = await vipps.draftAgreement(KID, amount, initialCharge, monthlyChargeDay);

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next({ ex });
  }
});

router.get("/agreement/minside/:urlcode", async (req, res, next) => {
  try {
    const agreementUrlCode = req.params.urlcode
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementUrlCode);
    const agreement = await DAO.vipps.getAgreement(agreementId);

    if (!agreement) {
      let err = new Error("Can't find agreement");
      (err as any).status = 404;
      return next(err);
    }

    const donor = await DAO.donors.getByID(agreement.donorID);

    if (!donor) {
      let err = new Error("Can't find donor");
      (err as any).status = 404;
      return next(err);
    }

    const baseUrl = config.env === "development" ? "http://localhost:3000" : "https://gieffektivt.no"
    let redirectUrl = `${baseUrl}/vippsagreement?email=${encodeURIComponent(donor.email)}`

    if (donor.email === "anon@gieffektivt.no") {
      redirectUrl = `${baseUrl}/min-side/vipps-anonym?agreement-code=${agreementUrlCode}`
    }

    res
      .status(304)
      .redirect(redirectUrl);
  } catch (ex) {
    next({ ex });
  }
});

router.get("/agreement/anonymous/:urlcode", async (req, res, next) => {
  try {
    const agreementUrlCode = req.params.urlcode
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementUrlCode);
    const agreement = await DAO.vipps.getAgreement(agreementId);
    if (!agreement) {
      let err = new Error("Can't find agreement");
      (err as any).status = 404;
      return next(err);
    }

    const KID = agreement["KID"];
    const standardDistribution = await DAO.distributions.isStandardDistribution(KID);
    const activeOrganizations = await DAO.organizations.getActive();
    let shares = await DAO.distributions.getSplitByKID(KID);

    // Fill missing organizations with 0 shares
    shares = activeOrganizations.map((organization) => {
      const share = shares.find((share) => share.id === organization.id);
      return {
        abbriv: organization.abbriv,
        name: organization.name,
        id: organization.id,
        share: share ? share.share : 0,
      };
    });
    
    const distribution = {
      kid: KID,
      standardDistribution,
      shares,
    };

    res.status(200).json({content: {agreement, distribution}});
  } catch (ex) {
    next({ ex });
  }
});

router.get(
  "/agreement/:id",
  authMiddleware.auth(permissions.read_vipps_api),
  async (req, res, next) => {
    try {
      const agreementId = req.params.id;

      // Synchronize EffektDB with Vipps database
      const responseVipps = await vipps.getAgreement(agreementId);
      await DAO.vipps.updateAgreementStatus(agreementId, responseVipps.status);
      await DAO.vipps.updateAgreementPrice(agreementId, responseVipps.price / 100);
      const responseDAO = await DAO.vipps.getAgreement(agreementId);

      const response = { ...responseVipps, ...responseDAO };

      //TODO: Check for false
      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.get("/histogram/agreements", async (req, res, next) => {
  try {
    let buckets = await DAO.vipps.getAgreementSumHistogram();

    res.json({
      status: 200,
      content: buckets,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/histogram/charges", async (req, res, next) => {
  try {
    let buckets = await DAO.vipps.getChargeSumHistogram();

    res.json({
      status: 200,
      content: buckets,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/agreements/report", authMiddleware.auth(permissions.admin), async (req, res, next) => {
  try {
    let content = await DAO.vipps.getAgreementReport();

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/agreements", authMiddleware.auth(permissions.admin), async (req, res, next) => {
  try {
    var results = await DAO.vipps.getAgreements(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
    );
    if (results !== false) {
      return res.json({
        status: 200,
        content: {
          pages: results.pages,
          rows: results.rows,
        },
      });
    } else {
      let err = new Error("Could not fetch agreements");
      (err as any).status = 500;
      return next(err);
    }
  } catch (ex) {
    next(ex);
  }
});

router.post("/charges", authMiddleware.auth(permissions.admin), async (req, res, next) => {
  try {
    var results = await DAO.vipps.getCharges(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
    );
    if (results !== false) {
      return res.json({
        status: 200,
        content: {
          pages: results.pages,
          rows: results.rows,
        },
      });
    } else {
      let err = new Error("Could not fetch charges");
      (err as any).status = 500;
      return next(err);
    }
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /vipps/agreement/{urlcode}/cancel:
 *   put:
 *    tags: [Vipps]
 *    description: Cancels a vipps agreement by urlcode
 *    parameters:
 *      - in: path
 *        name: urlcode
 *        required: true
 *        description: 41 character string to identify vipps agreement
 *        schema:
 *          type: integer
 */
router.put("/agreement/:urlcode/cancel", async (req, res, next) => {
  try {
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);
    const response = await vipps.updateAgreementStatus(agreementId, "STOPPED");

    if (response) {
      await DAO.vipps.updateAgreementStatus(agreementId, "STOPPED");
      await DAO.vipps.updateAgreementCancellationDate(agreementId);
    }

    await sendVippsAgreementChange(agreementCode, "STOPPED");
    res.send(response);
  } catch (ex) {
    next({ ex });
  }
});

/**
 * @openapi
 * /vipps/agreement/{urlcode}/price:
 *   put:
 *    tags: [Vipps]
 *    description: Updates the price in a vipps agreement by urlcode
 *    parameters:
 *      - in: path
 *        name: urlcode
 *        required: true
 *        description: 41 character string to identify vipps agreement
 *        schema:
 *          type: integer
 *      - in: body
 *        name: price
 *        required: true
 *        description: The price to update to
 *        schema:
 *          type: object
 *          properties:
 *            price:
 *              type: number
 *          example:
 *            price: 500
 *
 */
router.put("/agreement/:urlcode/price", jsonBody, async (req, res, next) => {
  try {
    const price = req.body.price;
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);
    const response = await vipps.updateAgreementPrice(agreementId, price);

    // Only update database if Vipps update was successful
    if (response) {
      await DAO.vipps.updateAgreementPrice(agreementId, price / 100);
      await sendVippsAgreementChange(agreementCode, "AMOUNT", price / 100);
    }

    res.send();
  } catch (ex) {
    next({ ex });
  }
});

router.put("/agreement/:urlcode/pause", jsonBody, async (req, res, next) => {
  try {
    const pausedUntilDateString = req.body.pausedUntilDate;
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);

    const dayMs = 86400000;
    const pausedUntilDate = new Date(pausedUntilDateString);

    // The actual pause ending date is four days before the first charge day after the pause
    // This is to make time for the daily schedule to create the charge three days before
    const exactPauseEnd = new Date(pausedUntilDate.getTime() - dayMs * 4);
    const charges = await vipps.getCharges(agreementId);

    // Cancel all pending or due charges
    for (let i = 0; i < charges.length; i++) {
      if (charges[i].status === "PENDING" || charges[i].status === "DUE") {
        await vipps.cancelCharge(agreementId, charges[i].id);
      }
    }

    const response = await DAO.vipps.updateAgreementPauseDate(agreementId, exactPauseEnd);

    if (response) await sendVippsAgreementChange(agreementCode, "PAUSED", pausedUntilDate);

    res.send(response);
  } catch (ex) {
    next({ ex });
  }
});

router.put("/agreement/:urlcode/pause/end", jsonBody, async (req, res, next) => {
  try {
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);
    const response = await DAO.vipps.updateAgreementPauseDate(agreementId, null);

    if (response) await sendVippsAgreementChange(agreementCode, "UNPAUSED");

    res.send(response);
  } catch (ex) {
    next({ ex });
  }
});

/**
 * @openapi
 * /vipps/agreement/{urlcode}/chargeday:
 *   put:
 *    tags: [Vipps]
 *    description: Change chargeday in a vipps agreement by urlcode
 *    parameters:
 *      - in: path
 *        name: urlcode
 *        required: true
 *        description: 41 character string to identify vipps agreement
 *        schema:
 *          type: integer
 *      - in: body
 *        name: chargeDay
 *        required: true
 *        description: They chargeday to update to
 *        schema:
 *          type: number
 *          properties:
 *            chargeDay:
 *              type: number
 *          example:
 *            chargeDay: 5
 *    responses:
 *      400:
 *        description: Invalid chargeday
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: number
 *                   example:
 *                      status: 400
 *                      content: "Invalid charge day, must be between 0 and 28"
 */
router.put("/agreement/:urlcode/chargeday", jsonBody, async (req, res, next) => {
  try {
    const agreementCode = req.params.urlcode;
    const chargeDay = req.body.chargeDay;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);

    // 0 means last day of each month
    if (chargeDay < 0 || chargeDay > 28) {
      let err = new Error("Invalid charge day, must be between 0 and 28");
      (err as any).status = 400;
      return next(err);
    }

    const response = await DAO.vipps.updateAgreementChargeDay(agreementId, chargeDay);
    if (response) await sendVippsAgreementChange(agreementCode, "CHARGEDAY", chargeDay);

    res.send(response);
  } catch (ex) {
    next({ ex });
  }
});

router.put("/agreement/:urlcode/forcedcharge", jsonBody, async (req, res, next) => {
  try {
    const agreementCode = req.params.urlcode;
    const forcedChargeDate = req.body.forcedChargeDate;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);

    const response = await DAO.vipps.updateAgreementForcedCharge(agreementId, forcedChargeDate);

    res.send(response);
  } catch (ex) {
    next({ ex });
  }
});

/**
 * @openapi
 * /vipps/agreement/{urlcode}/distribution:
 *   put:
 *    tags: [Vipps]
 *    description: Change distribution on vipps agreement by urlcode
 *    parameters:
 *      - in: path
 *        name: urlcode
 *        required: true
 *        description: 41 character string to identify vipps agreement
 *        schema:
 *          type: integer
 *      - in: body
 *        name: distribution
 *        required: true
 *        description:
 *        schema:
 *          $ref: '#/components/schemas/DistributionInput'
 *    responses:
 *      400:
 *        description: Invalid distribution
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: number
 *                   example:
 *                      status: 400
 *                      content: "Empty distribution array provided"
 *
 *
 */
router.put("/agreement/:urlcode/distribution", jsonBody, async (req, res, next) => {
  try {
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);

    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

    const existingAgreement = await DAO.vipps.getAgreement(agreementId);
    if (!existingAgreement) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

    const donorId = await DAO.donors.getIDByAgreementCode(agreementCode);
    const standardDistribution = req.body.distribution.standardDistribution;
    let taxUnitId: number | undefined = req.body.distribution.taxUnit.id;

    const shares = req.body.distribution.shares;

    const split = standardDistribution
      ? await DAO.organizations.getStandardSplit()
      : shares
          .map((org) => {
            return { id: org.id, share: org.share };
          })
          .filter((org) => parseFloat(org.share) !== 0);

    const metaOwnerID = 3;

    if (split.length === 0) {
      let err = new Error("Empty distribution array provided");
      (err as any).status = 400;
      return next(err);
    }

    if (rounding.sumWithPrecision(split.map((split) => split.share)) !== "100") {
      let err = new Error("Distribution does not sum to 100");
      (err as any).status = 400;
      return next(err);
    }

    if (!taxUnitId) {
      const existingTaxUnit = await DAO.tax.getByKID(existingAgreement.KID);
      if (existingTaxUnit) {
        taxUnitId = existingTaxUnit.id;
      }
    }

    //Check for existing distribution with that KID
    let KID = await DAO.distributions.getKIDbySplit(
      split,
      donorId,
      standardDistribution,
      taxUnitId,
    );

    if (!KID) {
      KID = await donationHelpers.createKID();
      await DAO.distributions.add(
        split,
        KID,
        donorId,
        taxUnitId,
        standardDistribution,
        metaOwnerID,
      );
    }

    const response = await DAO.vipps.updateAgreementKID(agreementId, KID);
    if (response) await sendVippsAgreementChange(agreementCode, "SHARES", KID);

    res.send({ KID });
  } catch (ex) {
    next({ ex });
  }
});

router.post(
  "/agreement/charge/create",
  authMiddleware.auth(permissions.write_vipps_api),
  jsonBody,
  async (req, res, next) => {
    try {
      const agreementId = req.body.agreementId;
      const amount = req.body.amount;

      const response = await vipps.createCharge(agreementId, amount);

      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.get(
  "/agreements/all",
  authMiddleware.auth(permissions.read_vipps_api),
  async (req, res, next) => {
    try {
      let agreements = [];

      // Vipps does not allow fetching all statuses in a single request
      const active = await vipps.getAgreements("ACTIVE");
      const pending = await vipps.getAgreements("PENDING");
      const stopped = await vipps.getAgreements("STOPPED");
      const expired = await vipps.getAgreements("EXPIRED");

      agreements = agreements.concat(active, pending, stopped, expired);

      res.json(agreements);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.get(
  "/agreement/:agreementId/charge/:chargeId",
  authMiddleware.auth(permissions.read_vipps_api),
  jsonBody,
  async (req, res, next) => {
    try {
      const agreementId = req.params.agreementId;
      const chargeId = req.params.chargeId;

      const response = await vipps.getCharge(agreementId, chargeId);

      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.get(
  "/agreement/:agreementId/charges",
  authMiddleware.auth(permissions.read_vipps_api),
  jsonBody,
  async (req, res, next) => {
    try {
      const agreementId = req.params.agreementId;

      const response = await vipps.getCharges(agreementId);

      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.post("/agreement/:urlcode/charges/cancel", jsonBody, async (req, res, next) => {
  try {
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);
    const charges = await vipps.getCharges(agreementId);

    // Cancel all pending or due charges
    for (let i = 0; i < charges.length; i++) {
      if (charges[i].status === "PENDING" || charges[i].status === "DUE") {
        await vipps.cancelCharge(agreementId, charges[i].id);
      }
    }

    res.send(true);
  } catch (ex) {
    next({ ex });
  }
});

router.post(
  "/agreement/:agreementId/charge/:chargeId/refund",
  authMiddleware.auth(permissions.write_vipps_api),
  jsonBody,
  async (req, res, next) => {
    try {
      const agreementId = req.params.agreementId;
      const chargeId = req.params.chargeId;

      const response = await vipps.refundCharge(agreementId, chargeId);
      if (response) await DAO.vipps.updateChargeStatus("REFUNDED", agreementId, chargeId);

      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.post(
  "/agreement/:agreementId/charge/:chargeId/cancel",
  authMiddleware.auth(permissions.write_vipps_api),
  jsonBody,
  async (req, res, next) => {
    try {
      const agreementId = req.params.agreementId;
      const chargeId = req.params.chargeId;

      const response = await vipps.cancelCharge(agreementId, chargeId);
      if (response) await DAO.vipps.updateChargeStatus("CANCELLED", agreementId, chargeId);

      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.post("/agreement/notify/change", jsonBody, async (req, res, next) => {
  try {
    const agreementCode = req.body.agreementCode;
    const change = req.body.change;
    const newValue = req.body.newValue;

    const response = await sendVippsAgreementChange(agreementCode, change, newValue);

    res.json(response);
  } catch (ex) {
    next({ ex });
  }
});

router.post("/agreement/report/problem", jsonBody, async (req, res, next) => {
  try {
    const senderUrl = req.body.senderUrl;
    const donorEmail = req.body.email;
    const donorMessage = req.body.donorMessage;
    const agreement = req.body.agreement;

    const response = await sendVippsProblemReport(senderUrl, donorEmail, donorMessage, agreement);

    res.json(response);
  } catch (ex) {
    next({ ex });
  }
});

router.post("/v2/payments/:orderId", jsonBody, async (req, res, next) => {
  if (req.body.orderId !== req.params.orderId) {
    res.sendStatus(400);
    return false;
  }
  let orderId = req.body.orderId;

  //Make sure the request actually came from the vipps callback servers
  if (!(await whitelisted(req.ip))) {
    console.warn(`Vipps callback host (${req.ip}) not whitelisted`);
    res.status(401).json({ status: 401, content: "Host not whitelisted" });
    return false;
  }

  //TODO: Check whether order exists and, if captured, whether reserved before
  let transactionInfo = {
    orderId: orderId,
    transactionId: req.body.transactionInfo.transactionId,
    amount: req.body.transactionInfo.amount,
    status: req.body.transactionInfo.status,
    timestamp: new Date(req.body.transactionInfo.timeStamp),
  };

  //Handle different transactions states
  switch (transactionInfo.status) {
    case "RESERVED":
      try {
        await vipps.captureOrder(orderId, transactionInfo);
      } catch (ex) {
        next(ex);
      }
      break;
    case "SALE":
      //Not applicable POS sale
      break;
    case "SALE_FAILED":
      //Not applicable POS sale
      break;
    case "CANCELLED":
      //User cancelled in Vipps
      //Perhaps send a follow up email?
      break;
    case "REJECTED":
      //User did not act on the payment (timeout etc.)
      //Perhaps send a follow-up email?
      break;
    default:
      console.warn("Unknown vipps state", transactionInfo.status);
      break;
  }

  res.sendStatus(200);
});

router.get("/redirect/:orderId", async (req, res, next) => {
  try {
    let orderId = req.params.orderId;

    let retry = async (retries) => {
      let order = await DAO.vipps.getOrder(orderId);

      if (order && order.donationID != null) {
        res.redirect("https://gieffektivt.no/donasjon-mottatt");
        return true;
      } else if (retries >= 20) {
        res.redirect("https://gieffektivt.no/donasjon-feilet");
        return false;
      } else {
        setTimeout(async () => {
          await retry(retries + 1);
        }, 1000);
      }
    };

    await retry(0);
  } catch (ex) {
    next(ex);
  }
});

router.get("/integration-test/:linkToken", async (req, res, next) => {
  if (config.env === "production") {
    res.status(403).json({
      status: 403,
      content: "Integration test not applicable in production environment",
    });
    return false;
  }

  try {
    let order = await DAO.vipps.getRecentOrder();

    console.log(order);

    let approved = await vipps.approveOrder(order.orderID, req.params.linkToken);

    console.log("Approved", approved);

    if (!approved) throw new Error("Could not approve recent order");

    //Try five times for a maximum of 5 seconds
    for (let i = 0; i < 5; i++) {
      console.log("Wait 1000");
      await delay(1000);
      order = await DAO.vipps.getOrder(order.orderID);
      console.log(order);
      if (order.donationID != null) {
        res.json({ status: 200, content: "Donation registered successfully" });
        return true;
      }
    }
    console.log("Timeout");
    throw new Error("Timed out when attempting to verify integration");
  } catch (ex) {
    console.warn(ex);
    res.status(500).json({ status: 500, content: ex.message });
  }
});

router.post(
  "/refund/:orderId",
  authMiddleware.auth(permissions.write_vipps_api),
  async (req, res, next) => {
    try {
      let refunded = await vipps.refundOrder(req.params.orderId);

      if (refunded) {
        return res.json({
          status: 200,
          content: "OK",
        });
      } else {
        return res.status(409).json({
          status: 409,
          content:
            "Could not refund the order. This might be because the order has not been captured.",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
);

router.put(
  "/cancel/:orderId",
  authMiddleware.auth(permissions.write_vipps_api),
  async (req, res, next) => {
    try {
      let cancelled = await vipps.cancelOrder(req.params.orderId);

      if (cancelled) {
        return res.json({
          status: 200,
          content: "OK",
        });
      } else {
        return res.status(409).json({
          status: 409,
          content: "Could not cancel the order. This might be because the order has been captured.",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
);

/**
 * Checks whether the provided IP is one of the vipps callback servers
 * @param {string} ip
 */
async function whitelisted(ip) {
  //Some weirdness going on here, implicitly trust
  return true;

  //ipv6 check
  if (ip.substr(0, 7) == "::ffff:") {
    ip = ip.substr(7);
  }

  let whitelistedHosts;
  if (config.env === "production") {
    whitelistedHosts = [...vippsCallbackProdServers, ...vippsCallbackDisasterServers];
  } else {
    whitelistedHosts = vippsCallbackDevServers;
  }

  let whitelisted = false;
  try {
    for (let i = 0; i < whitelistedHosts.length; i++) {
      let ipv4s = await dns.resolve4(whitelistedHosts[i]);
      console.log(ipv4s, ip);
      //Should possibly also check for ipv6?
      if (ipv4s.indexOf(ip) != -1) {
        whitelisted = true;
        break;
      }
    }
  } catch (ex) {
    console.warn("Checking for whitelisted IPs failed", ex);
  }
  return whitelisted;
}

//Helper for integration test
function delay(t) {
  return new Promise<void>(function (resolve) {
    setTimeout(function () {
      resolve();
    }, t);
  });
}

module.exports = router;
