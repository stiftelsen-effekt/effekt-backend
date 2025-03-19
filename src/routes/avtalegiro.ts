import * as express from "express";
import { checkDonorOwnsDistribution } from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendAvtaleGiroChange, sendAvtalegiroRegistered } from "../custom_modules/mail";
import { donationHelpers } from "../custom_modules/donationHelpers";
import { DistributionInput } from "../schemas/types";
import permissions from "../enums/authorizationPermissions";
import moment from "moment";
import { validateDistribution } from "../custom_modules/distribution";
import { LocaleRequest, localeMiddleware } from "../middleware/locale";
import { encodePlausibleData } from "../custom_modules/plausible";

const router = express.Router();

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
router.get(
  "/agreement/:id",
  authMiddleware.isAdmin,
  localeMiddleware,
  async (req: LocaleRequest, res, next) => {
    try {
      const agreement = await DAO.avtalegiroagreements.getAgreement(req.params.id);

      if (!agreement) return res.sendStatus(404);

      const distribution = await DAO.distributions.getSplitByKID(agreement.KID);

      return res.json({
        status: 200,
        content: {
          ...agreement,
          distribution,
        },
      });
    } catch (ex) {
      next(ex);
    }
  },
);

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

    const content = await DAO.avtalegiroagreements.getExpectedDonationsForDate(date);

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

    const content = await DAO.avtalegiroagreements.getRecievedDonationsForDate(date);

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
 * /donations/status:
 *   get:
 *    tags: [Donations]
 *    description: Redirects to donation success when query is ok, donation failed if not ok. Used for payment processing.
 */
router.get("/:KID/redirect", async (req, res, next) => {
  try {
    if (req.query.status && (req.query.status as string).toUpperCase() === "OK") {
      const agreement = await DAO.avtalegiroagreements.getByKID(req.params.KID);
      await sendAvtalegiroRegistered(agreement);

      res.redirect(
        `https://gieffektivt.no/opprettet?plausible=${encodePlausibleData({
          revenue: Math.round(agreement.amount / 100).toString(),
          method: "avtalegiro",
          recurring: true,
          kid: req.params.KID,
        })}`,
      );
    } else res.redirect("https://gieffektivt.no/avtale-feilet");
  } catch (ex) {
    next({ ex });
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
 *                ID:
 *                  type: number
 *                share:
 *                  type: string
 *              example:
 *                 ID: 1
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
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      if (!req.body) return res.sendStatus(400);
      if (!req.body.distribution)
        return res.status(400).json({ status: 400, content: "Missing distribution object" });
      const originalKID: string = req.params.KID;
      const distributionInput = req.body.distribution as DistributionInput;

      let validatedDistribtion: DistributionInput | null = null;
      try {
        validatedDistribtion = validateDistribution(distributionInput);
      } catch (ex) {
        return res.status(400).json({
          status: 400,
          content: ex.message,
        });
      }

      if (validatedDistribtion) {
        const originalDistribution = await DAO.distributions.getSplitByKID(originalKID);
        const newKid = await donationHelpers.createAvtaleGiroKID();
        await DAO.avtalegiroagreements.replaceDistribution(
          originalDistribution,
          newKid,
          validatedDistribtion,
        );
        await sendAvtaleGiroChange(originalKID, "SHARES");

        res.json({
          status: 200,
          content: "OK",
        });
      } else {
        res.status(400).json({
          status: 400,
          content: "Invalid distribution",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
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
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const KID = req.params.KID;
      const active = req.body.active;

      const response = await DAO.avtalegiroagreements.setActive(KID, active);

      if (active === 0) await sendAvtaleGiroChange(KID, "CANCELLED");
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  },
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
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const KID = req.params.KID;
      const amount = req.body.amount;

      const response = await DAO.avtalegiroagreements.updateAmount(KID, amount);

      let newAmountInNok = parseFloat(amount) / 100;

      await sendAvtaleGiroChange(KID, "AMOUNT", newAmountInNok.toString());
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  },
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
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const KID = req.params.KID;
      const paymentDate = req.body.paymentDate;

      const response = await DAO.avtalegiroagreements.updatePaymentDate(KID, paymentDate);

      await sendAvtaleGiroChange(KID, "CHARGEDAY", paymentDate);
      res.send(response);
    } catch (ex) {
      next({ ex });
    }
  },
);

router.get("/donations/:kid", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const donations = await DAO.avtalegiroagreements.getDonationsByKID(req.params.kid);
    return res.json({
      status: 200,
      content: donations,
    });
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
