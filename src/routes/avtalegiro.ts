import * as express from "express";
import { checkAvtaleGiroAgreement } from "../custom_modules/authorization/authMiddleware";

const router = express.Router();
const DAO = require("../custom_modules/DAO.js");
const rounding = require("../custom_modules/rounding");
const donationHelpers = require("../custom_modules/donationHelpers");
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const authRoles = require("../enums/authorizationRoles");
const mail = require("../custom_modules/mail");
const moment = require("moment");

/**
 * @openapi
 * tags:
 *   - name: Avtalegiro
 *     description: Avtalegiro agreements in the database.
 */

router.post("/draft", async (req, res, next) => {
  if (!req.body) return res.sendStatus(400);

  const parsedData = req.body;
  const KID = parsedData.KID;
  const amount = parsedData.amount;
  if (amount <= 0) return res.sendStatus(400);

  const dueDay = parsedData.dueDay <= 28 ? parsedData.dueDay : 0;

  try {
    // Amount is given in NOK in Widget, but øre is used for agreements
    await DAO.avtalegiroagreements.add(KID, amount * 100, dueDay, true);
  } catch (ex) {
    return next(ex);
  }

  res.json({ status: 200 });
});

router.post("/agreements", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var results = await DAO.avtalegiroagreements.getAgreements(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter
    );
    return res.json({
      status: 200,
      content: {
        pages: results.pages,
        rows: results.rows,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /avtalegiro/agreement/{id}:
 *   get:
 *    tags: [Avtalegiro]
 *    description: Get a avtalegiro agreement by avtalegiro id
 *    security:
 *       - auth0_jwt: [read:donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the avtalegiro to retrieve.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns an avtalegiro agreement object
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content:
 *                        $ref: '#/components/schemas/AvtalegiroAgreement'
 *                   example:
 *                      content:
 *                        $ref: '#/components/schemas/AvtalegiroAgreement/example'
 *      401:
 *        description: User not authorized to view resource
 */
router.get("/agreement/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var result = await DAO.avtalegiroagreements.getAgreement(req.params.id);
    result["ID"] = result["ID"].toString();

    return res.json({
      status: 200,
      content: {
        ...result,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/histogram", async (req, res, next) => {
  try {
    let buckets = await DAO.avtalegiroagreements.getAgreementSumHistogram();

    res.json({
      status: 200,
      content: buckets,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/report", async (req, res, next) => {
  try {
    let content = await DAO.avtalegiroagreements.getAgreementReport();

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/validation", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let content = await DAO.avtalegiroagreements.getValidationTable();

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/missing/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let date = req.query.date;

    if (!date) throw new Error("Date query missing");

    if (!moment(date, moment.ISO_8601, true).isValid())
      throw new Error("Date query must be in ISO 8601 format");

    date = new Date(date);

    const content = await DAO.avtalegiroagreements.getMissingForDate(date);

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/expected/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let date = req.query.date;

    if (!date) throw new Error("Date query missing");

    if (!moment(date, moment.ISO_8601, true).isValid())
      throw new Error("Date query must be in ISO 8601 format");

    date = new Date(date);

    const content = await DAO.avtalegiroagreements.getExpectedDonationsForDate(
      date
    );

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/recieved/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let date = req.query.date;

    if (!date) throw new Error("Date query missing");

    if (!moment(date, moment.ISO_8601, true).isValid())
      throw new Error("Date query must be in ISO 8601 format");

    date = new Date(date);

    const content = await DAO.avtalegiroagreements.getRecievedDonationsForDate(
      date
    );

    res.json({
      status: 200,
      content,
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /avtalegiro/{KID}/distribution:
 *   post:
 *    tags: [Avtalegiro]
 *    description: Update distribution by KID
 *    security:
 *       - auth0_jwt: [write:agreements]
 *    parameters:
 *      - in: path
 *        name: KID
 *        required: true
 *        description: KID of the distribution to update
 *        schema:
 *          type: integer
 *      - in: body
 *        name: distribution
 *        required: true
 *        description:
 *        schema:
 *          type: object
 *          properties:
 *            distribution:
 *              type: object
 *              properties:
 *                organizationId:
 *                  type: number
 *                share:
 *                  type: string
 *              example:
 *                 organizationId: 1
 *                 share: "100.000000000000"
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
 */
router.post(
  "/:KID/distribution",
  //authMiddleware.auth(authRoles.write_agreements),
  (req, res, next) => {
    checkAvtaleGiroAgreement(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      if (!req.body) return res.sendStatus(400);
      const originalKID = req.params.KID;
      const parsedData = req.body;
      const distribution = parsedData.distribution;
      const donor = await DAO.donors.getByKID(originalKID);
      const donorId = donor.id;

      let split = distribution.map((org) => {
        return { organizationID: org.organizationId, share: org.share };
      });
      const metaOwnerID = 3;

      let standardSplit = false;
      if (!split) {
        split = await donationHelpers.getStandardSplit();
        let standardSplit = true;
      }

      if (
        rounding.sumWithPrecision(split.map((split) => split.share)) !== "100"
      ) {
        let err = new Error("Distribution does not sum to 100");
        (err as any).status = 400;
        return next(err);
      }

      // Create new KID for the old replaced distribution
      const replacementKID = await donationHelpers.createKID(15, donorId);

      // Replace distribution
      const response = await DAO.avtalegiroagreements.replaceDistribution(
        replacementKID,
        originalKID,
        split,
        donorId,
        standardSplit,
        metaOwnerID
      );

      await mail.sendAvtaleGiroChange(originalKID, "SHARES", split);
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  }
);

/**
 * @openapi
 * /avtalegiro/{KID}/status:
 *   post:
 *    tags: [Avtalegiro]
 *    description: Update status by KID
 *    security:
 *       - auth0_jwt: [write:agreements]
 *    parameters:
 *      - in: path
 *        name: KID
 *        required: true
 *        description: KID of the distribution to update
 *        schema:
 *          type: integer
 *      - in: body
 *        name: active
 *        required: true
 *        description:
 *        schema:
 *          type: boolean
 *          example:
 *            active: 1
 */
router.post(
  "/:KID/status",
  //authMiddleware.auth(authRoles.write_agreements),
  (req, res, next) => {
    checkAvtaleGiroAgreement(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const KID = req.params.KID;
      const active = req.body.active;

      const response = await DAO.avtalegiroagreements.setActive(KID, active);

      if (active === 0) await mail.sendAvtaleGiroChange(KID, "CANCELLED");
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  }
);

/**
 * @openapi
 * /avtalegiro/{KID}/amount:
 *   post:
 *    tags: [Avtalegiro]
 *    description: Update amount by KID
 *    security:
 *       - auth0_jwt: [write:agreements]
 *    parameters:
 *      - in: path
 *        name: KID
 *        required: true
 *        description: KID of the amount to update
 *        schema:
 *          type: integer
 *      - in: body
 *        name: amount
 *        required: true
 *        description: The amount to update to
 *        schema:
 *          type: number
 *          example:
 *            amount: 10000
 */
router.post(
  "/:KID/amount",
  //authMiddleware.auth(authRoles.write_agreements),
  (req, res, next) => {
    checkAvtaleGiroAgreement(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const KID = req.params.KID;
      const amount = req.body.amount;

      const response = await DAO.avtalegiroagreements.updateAmount(KID, amount);

      await mail.sendAvtaleGiroChange(KID, "AMOUNT", amount);
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  }
);

/**
 * @openapi
 * /avtalegiro/{KID}/paymentdate:
 *   post:
 *    tags: [Avtalegiro]
 *    description: Update paymentdate by KID
 *    security:
 *       - auth0_jwt: [write:agreements]
 *    parameters:
 *      - in: path
 *        name: KID
 *        required: true
 *        description: KID of the paymentdate to update
 *        schema:
 *          type: integer
 *      - in: body
 *        name: paymentDate
 *        required: true
 *        description: The date to change payment to
 *        schema:
 *          type: object
 *          properties:
 *            paymentDate:
 *              type: integer
 *              example: 5
 */
router.post(
  "/:KID/paymentdate",
  //authMiddleware.auth(authRoles.write_agreements),
  (req, res, next) => {
    checkAvtaleGiroAgreement(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const KID = req.params.KID;
      const paymentDate = req.body.paymentDate;

      const response = await DAO.avtalegiroagreements.updatePaymentDate(
        KID,
        paymentDate
      );

      await mail.sendAvtaleGiroChange(KID, "CHARGEDAY", paymentDate);
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  }
);

module.exports = router;
