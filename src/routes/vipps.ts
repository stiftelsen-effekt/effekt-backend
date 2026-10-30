import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendVippsAgreementChange, sendVippsProblemReport } from "../custom_modules/mail";
import { DAO } from "../custom_modules/DAO";
import permissions from "../enums/authorizationPermissions";

import express from "express";
const router = express.Router();
import bodyParser from "body-parser";
import { DistributionInput } from "../schemas/types";
import { encodePlausibleData } from "../custom_modules/plausible";
import { getFundraiserRedirectUrl } from "../custom_modules/fundraiserRedirect";
import { exportCsv } from "../custom_modules/csvexport";
import { verifyVippsWebhookSignature } from "../custom_modules/vippsWebhookAuth";
const jsonBody = bodyParser.json();
import crypto from "crypto";
const config = require("../config");
const vipps = require("../custom_modules/vipps");
import * as vippsService from "../custom_modules/vippsService";

/**
 * @openapi
 * tags:
 *   - name: Vipps
 *     description: Vipps agreements in the database.
 */

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
    const agreementUrlCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementUrlCode);
    const agreement = agreementId && (await DAO.vipps.getAgreement(agreementId));

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

    const baseUrl =
      config.env === "development" ? "http://localhost:3000" : "https://gieffektivt.no";
    let redirectUrl = `${baseUrl}/vippsagreement?email=${encodeURIComponent(donor.email)}`;

    if (donor.email === "anon@gieffektivt.no") {
      redirectUrl = `${baseUrl}/min-side/vipps-anonym?agreement-code=${agreementUrlCode}`;
    }

    res.status(304).redirect(redirectUrl);
  } catch (ex) {
    next({ ex });
  }
});

router.get("/agreement/anonymous/:urlcode", async (req, res, next) => {
  try {
    const agreementUrlCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementUrlCode);
    const agreement = agreementId && (await DAO.vipps.getAgreement(agreementId));
    if (!agreement) {
      let err = new Error("Can't find agreement");
      (err as any).status = 404;
      return next(err);
    }

    const KID = agreement["KID"];

    const distribution = await DAO.distributions.getSplitByKID(KID);

    res.status(200).json({
      content: {
        agreement,
        distribution,
      },
    });
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
      const response = await vippsService.syncAndGetAgreement(agreementId);

      //TODO: Check for false
      res.json(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.get("/matchingrules", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const matchingRules = await DAO.vipps.getMatchingRules();
    res.json({
      status: 200,
      content: matchingRules,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/matchingrules", authMiddleware.isAdmin, jsonBody, async (req, res, next) => {
  try {
    const matchingRule = req.body;

    if (!matchingRule.resolveKID) {
      return res.status(400).json({
        status: 400,
        content: "Missing resolveKID",
      });
    }

    if (!matchingRule.periodFrom || !matchingRule.periodTo) {
      return res.status(400).json({
        status: 400,
        content: "Missing periodFrom or periodTo",
      });
    }

    const created = await vippsService.createMatchingRule(matchingRule);
    if (!created.ok) {
      return res.status(created.status).json({
        status: created.status,
        content: created.message,
      });
    }

    res.json({
      status: 200,
      content: created.result,
    });
  } catch (ex) {
    next(ex);
  }
});

router.delete("/matchingrules/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;

    if (isNaN(parseInt(id))) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const result = await DAO.vipps.deleteMatchingRule(parseInt(id));
    if (!result) {
      return res.status(404).json({
        status: 404,
        content: "Matching rule not found",
      });
    } else {
      res.json({
        status: 200,
        content: "Matching rule deleted successfully",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

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

router.get("/agreements/report", authMiddleware.isAdmin, async (req, res, next) => {
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

router.post("/agreements", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (req.body.export === true) {
      const results = await DAO.vipps.getAgreements(
        req.body.sort,
        0,
        Number.MAX_SAFE_INTEGER,
        req.body.filter,
        req.locale,
      );

      return exportCsv(res, results.rows, `vipps-agreements-${new Date().toISOString()}.csv`);
    }

    if (typeof req.body.page === "undefined" || typeof req.body.limit === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing required fields: page, limit",
      });
    }

    var results = await DAO.vipps.getAgreements(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
    );
    return res.json({
      status: 200,
      content: {
        pages: results.pages,
        rows: results.rows,
        statistics: results.statistics,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/charges", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var results = await DAO.vipps.getCharges(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
    );
    return res.json({
      status: 200,
      content: {
        pages: results.pages,
        rows: results.rows,
        statistics: results.statistics,
      },
    });
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
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }
    const response = await vippsService.cancelAgreement(agreementId, agreementCode);

    if (!response) {
      res.status(500).json({
        status: 500,
        content: "Could not cancel agreement",
      });
    }

    res.status(200).json({
      status: 200,
      content: response,
    });
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
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }
    const response = await vippsService.updateAgreementPrice(agreementId, agreementCode, price);

    if (!response) {
      res.status(500).json({
        status: 500,
        content: "Could not update agreement price",
      });
    }

    res.status(200).json({
      status: 200,
      content: response,
    });
  } catch (ex) {
    next({ ex });
  }
});

router.put("/agreement/:urlcode/pause", jsonBody, async (req, res, next) => {
  try {
    const pausedUntilDateString = req.body.pausedUntilDate;
    const agreementCode = req.params.urlcode;
    const agreementId = await DAO.vipps.getAgreementIdByUrlCode(agreementCode);
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

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
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }
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
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

    // 0 means last day of each month
    if (chargeDay < 0 || chargeDay > 28) {
      let err = new Error("Invalid charge day, must be between 0 and 28");
      (err as any).status = 400;
      return next(err);
    }

    const response = await vippsService.updateAgreementChargeDay(
      agreementId,
      agreementCode,
      chargeDay,
    );

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
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

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

    const result = await vippsService.updateAgreementDistribution(
      agreementId,
      agreementCode,
      req.body.distribution as DistributionInput,
    );
    if (!result.ok) {
      return res.status(result.status).json({
        status: result.status,
        content: result.message,
      });
    }
    const KID = result.KID;

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

router.get("/agreementredirect/:urlcode", async (req, res, next) => {
  try {
    const urlcode = req.params.urlcode;

    let retry = async (retries) => {
      const agreementId = await DAO.vipps.getAgreementIdByUrlCode(urlcode);
      if (!agreementId) {
        return res.status(404).json({
          status: 404,
          content: "Agreement not found",
        });
      }
      const agreement = await DAO.vipps.getAgreement(agreementId);

      if (retries >= 20) {
        res.redirect("https://gieffektivt.no/avtale-feilet");
        return false;
      }

      if (agreement) {
        if (agreement.status === "ACTIVE") {
          const plausible = encodePlausibleData({
            revenue: Math.round(agreement.amount).toString(),
            method: "vipps",
            recurring: true,
            kid: agreement.KID,
          });
          const fundraiserTransaction = await DAO.fundraisers.getFundraiserTransactionByKID(
            agreement.KID,
          );

          if (fundraiserTransaction) {
            res.redirect(
              await getFundraiserRedirectUrl(
                fundraiserTransaction.fundraiserId,
                plausible,
                `https://gieffektivt.no/opprettet?plausible=${plausible}`,
              ),
            );
            return true;
          }

          res.redirect(`https://gieffektivt.no/opprettet?plausible=${plausible}`);
          return true;
        }
        if (agreement.status === "STOPPED" || agreement.status === "EXPIRED") {
          res.redirect("https://gieffektivt.no/avtale-feilet");
          return false;
        }
      }

      setTimeout(async () => {
        await retry(retries + 1);
      }, 1000);
    };

    await retry(0);
  } catch (ex) {
    next({ ex });
  }
});

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
    if (!agreementId) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }
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

      const response = await vippsService.refundCharge(agreementId, chargeId);

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

/**
 * Callback from the Vipps eCom v2 API for one-off payments (callbackPrefix set in
 * vipps.initiateOrder). Vipps echoes the per-order authToken we registered when creating
 * the payment in the Authorization header, which is how we know the callback is genuine.
 * The callback body is only used as a trigger: the amount to capture is taken from the
 * order details fetched from Vipps, never from the request body.
 */
router.post("/v2/payments/:orderId", jsonBody, async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    if (req.body?.orderId !== orderId || typeof req.body?.transactionInfo !== "object") {
      return res.sendStatus(400);
    }

    const order = await DAO.vipps.getOrder(orderId);
    if (!order) {
      console.warn(`Vipps callback for unknown order ${orderId}`);
      return res.sendStatus(404);
    }

    if (!vippsCallbackAuthTokenMatches(order.token, req.get("authorization"))) {
      console.warn(`Vipps callback for order ${orderId} with invalid authorization`);
      return res.status(401).json({ status: 401, content: "Unauthorized" });
    }

    const status = req.body.transactionInfo.status;

    //Handle different transactions states
    switch (status) {
      case "RESERVED": {
        // Capture the amount Vipps reports as reserved, not the amount in the callback body
        const orderDetails = await vipps.getOrderDetails(orderId);
        const reserveLogItem = vipps.findTransactionLogItem(
          orderDetails.transactionLogHistory,
          "RESERVE",
        );
        if (reserveLogItem) {
          await vipps.captureOrder(orderId, reserveLogItem);
        } else {
          console.warn(
            `Vipps callback for order ${orderId} reported RESERVED, but Vipps has no reservation`,
          );
        }
        break;
      }
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
        console.warn("Unknown vipps state", status);
        break;
    }

    res.sendStatus(200);
  } catch (ex) {
    next(ex);
  }
});

/**
 * Constant-time check of the Authorization header of a Vipps eCom v2 callback against the
 * authToken stored for the order. Orders without a stored token are rejected.
 */
function vippsCallbackAuthTokenMatches(
  expected: string | null | undefined,
  provided: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(a, b);
}

router.post("/fundraiser/:id/webhook", jsonBody, async (req, res, next) => {
  console.log("Webhook received for fundraiser", req.params.id);
  console.log(req.body);

  return res.sendStatus(200);
});

/**
 * Vipps Webhooks API endpoint for recurring agreement events.
 * Registered via POST https://api.vipps.no/webhooks/v1/webhooks with event "recurring.agreement-stopped.v1".
 * The registration response secret must be stored as VIPPS_RECURRING_WEBHOOK_SECRET.
 */
router.post("/webhooks/v1/recurring", async (req: any, res, next) => {
  try {
    const isValid = verifyVippsWebhookSignature(
      req.method,
      req.originalUrl,
      {
        "x-ms-date": req.headers["x-ms-date"],
        "x-ms-content-sha256": req.headers["x-ms-content-sha256"],
        host: req.headers["host"],
        authorization: req.headers["authorization"],
      },
      req.rawBody,
    );

    if (!isValid) {
      return res.status(401).json({ status: 401, content: "Invalid webhook signature" });
    }

    const { eventType, agreementId, actor } = req.body;

    if (eventType === "recurring.agreement-stopped.v1") {
      console.log(`Vipps agreement ${agreementId} stopped by ${actor ?? "unknown"}`);

      await DAO.vipps.updateAgreementStatus(agreementId, "STOPPED");
      await DAO.vipps.updateAgreementCancellationDate(agreementId);
    }

    return res.sendStatus(200);
  } catch (ex) {
    next(ex);
  }
});

router.get("/redirect/:orderId", async (req, res, next) => {
  try {
    let orderId = req.params.orderId;

    let retry = async (retries) => {
      let order = await DAO.vipps.getOrder(orderId);

      if (order && order.donationID != null) {
        const donation = await DAO.donations.getByID(order.donationID);

        if (donation.fundraiserId) {
          // Temp hardcoded to preview frontend, should be changed to production frontend (${config.frontend_url}/)
          const plausible = encodePlausibleData({
            revenue: donation.sum.toString(),
            method: "vipps",
            recurring: false,
            kid: order.KID,
          });
          res.redirect(
            await getFundraiserRedirectUrl(
              donation.fundraiserId,
              plausible,
              `https://gieffektivt.no/donasjon-mottatt?plausible=${plausible}`,
            ),
          );
          return true;
        }

        res.redirect(
          `https://gieffektivt.no/donasjon-mottatt?plausible=${encodePlausibleData({
            revenue: donation.sum.toString(),
            method: "vipps",
            recurring: false,
            kid: order.KID,
          })}`,
        );
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

    if (!order) {
      res.status(404).json({
        status: 404,
        content: "No recent order found",
      });
      return false;
    }

    let approved = await vipps.approveOrder(order.orderID, req.params.linkToken);

    if (!approved) throw new Error("Could not approve recent order");

    //Try five times for a maximum of 5 seconds
    for (let i = 0; i < 5; i++) {
      console.log("Wait 1000");
      await delay(1000);
      if (!order) {
        continue;
      }
      order = await DAO.vipps.getOrder(order.orderID);
      console.log(order);
      if (order && order.donationID != null) {
        res.json({ status: 200, content: "Donation registered successfully" });
        return true;
      }
    }
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

//Helper for integration test
function delay(t) {
  return new Promise<void>(function (resolve) {
    setTimeout(function () {
      resolve();
    }, t);
  });
}

module.exports = router;
