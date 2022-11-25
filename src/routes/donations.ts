import * as express from "express";
import { DAO } from "../custom_modules/DAO";
import { donationHelpers } from "../custom_modules/donationHelpers";

const config = require("../config");

const router = express.Router();
const bodyParser = require("body-parser");
const urlEncodeParser = bodyParser.urlencoded({ extended: true });
const apicache = require("apicache");
const cache = apicache.middleware;
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import {
  sendDonationHistory,
  sendDonationReciept,
  sendDonationRegistered,
} from "../custom_modules/mail";

const methods = require("../enums/methods");

const vipps = require("../custom_modules/vipps");
const dateRangeHelper = require("../custom_modules/dateRangeHelper");
const rateLimit = require("express-rate-limit");

/**
 * @openapi
 * /donations/status:
 *   get:
 *    tags: [Donations]
 *    description: Redirects to donation success when query is ok, donation failed if not ok. Used for payment processing.
 */
router.get("/status", async (req, res, next) => {
  try {
    if (req.query.status && (req.query.status as string).toUpperCase() === "OK")
      res.redirect("https://gieffektivt.no/donasjon-mottatt");
    else res.redirect("https://gieffektivt.no/donasjon-feilet");
  } catch (ex) {
    next({ ex });
  }
});

/**
 * @openapi
 * /donations/register:
 *   post:
 *    tags: [Donations]
 *    description: Registers a pending donation
 */
router.post("/register", async (req, res, next) => {
  if (!req.body) return res.sendStatus(400);
  let parsedData = req.body;

  let donationOrganizations = parsedData.organizations;
  let donor = parsedData.donor;
  let paymentProviderUrl = "";
  let recurring = parsedData.recurring;

  try {
    var donationObject: {
      KID: string;
      method: string;
      donorID: number | null;
      taxUnitId: number;
      amount: string;
      split: any[];
      recurring: boolean;
      standardSplit?: boolean;
    } = {
      KID: null, //Set later in code
      method: parsedData.method,
      donorID: null, //Set later in code
      taxUnitId: null, //Set later in code
      amount: parsedData.amount,
      standardSplit: undefined,
      split: [],
      recurring: parsedData.recurring,
    };

    //Create a donation split object
    if (donationOrganizations) {
      donationObject.split = await donationHelpers.createDonationSplitArray(
        donationOrganizations
      );
      donationObject.standardSplit = false;
    } else {
      donationObject.split = await donationHelpers.getStandardSplit();
      donationObject.standardSplit = true;
    }

    //Check if existing donor
    donationObject.donorID = await DAO.donors.getIDbyEmail(donor.email);

    if (donationObject.donorID == null) {
      //Donor does not exist, create donor
      donationObject.donorID = await DAO.donors.add(
        donor.email,
        donor.name,
        // !!--!! ================================================= SSN removed
        donor.newsletter
      );
      donationObject.taxUnitId = await DAO.tax.addTaxUnit(
        donationObject.donorID,
        donor.ssn,
        donor.name
      );
    } else {
      // !!--!! =================================================
      //Check for existing tax unit if SSN provided
      if (
        typeof donor.ssn !== "undefined" &&
        donor.ssn != null &&
        donor.ssn !== ""
      ) {
        const existingTaxUnit = await DAO.tax.getByDonorIdAndSsn(
          donationObject.donorID,
          donor.ssn
        );

        if (existingTaxUnit) {
          donationObject.taxUnitId = existingTaxUnit.id;
        } else {
          donationObject.taxUnitId = await DAO.tax.addTaxUnit(
            donationObject.donorID,
            donor.ssn,
            donor.name
          );
        }
      }
      // !!--!! =================================================
      // Check that name is registered and update name if no name set
      const dbDonor = await DAO.donors.getByID(donationObject.donorID);
      if (dbDonor.name === "" || dbDonor.name === null) {
        await DAO.donors.updateName(donationObject.donorID, donor.name);
      }

      //Check if registered for newsletter
      if (typeof donor.newsletter !== "undefined" && donor.newsletter != null) {
        let dbDonor = await DAO.donors.getByID(donationObject.donorID);
        if (!dbDonor.newsletter) {
          //Not registered for newsletter, updating donor
          await DAO.donors.updateNewsletter(
            donationObject.donorID,
            donor.newsletter
          );
        }
      }
    }

    /** Use new KID for avtalegiro */
    if (
      donationObject.method == methods.BANK &&
      donationObject.recurring == true
    ) {
      //Create unique KID for each AvtaleGiro to prevent duplicates causing conflicts
      donationObject.KID = await donationHelpers.createKID(
        15,
        donationObject.donorID
      );
      // !!--!! ================================================= TAX UNIT
      await DAO.distributions.add(
        donationObject.split,
        donationObject.KID,
        donationObject.donorID,
        donationObject.taxUnitId,
        donationObject.standardSplit
      );
    } else {
      //Try to get existing KID
      // !!--!! ================================================= TAX UNIT
      donationObject.KID = await DAO.distributions.getKIDbySplit(
        donationObject.split,
        donationObject.donorID,
        donationObject.standardSplit,
        donationObject.taxUnitId
      );

      //Split does not exist create new KID and split
      if (donationObject.KID == null) {
        donationObject.KID = await donationHelpers.createKID();

        // !!--!! ================================================= TAX UNIT
        await DAO.distributions.add(
          donationObject.split,
          donationObject.KID,
          donationObject.donorID,
          donationObject.taxUnitId,
          donationObject.standardSplit
        );
      }
    }

    if (donationObject.method == methods.VIPPS && recurring == 0) {
      const res = await vipps.initiateOrder(
        donationObject.KID,
        donationObject.amount
      );
      paymentProviderUrl = res.externalPaymentUrl;

      //Start polling for updates (move this to inside initiateOrder?)
      await vipps.pollOrder(res.orderId);
    }

    try {
      await DAO.initialpaymentmethod.addPaymentIntent(
        donationObject.KID,
        donationObject.method
      );
    } catch (error) {
      console.error(error);
    }
  } catch (ex) {
    return next(ex);
  }

  try {
    var hasAnsweredReferral = await DAO.referrals.getDonorAnswered(
      donationObject.donorID
    );
  } catch (ex) {
    console.error(
      `Could not get whether donor answered referral for donorID ${donationObject.donorID}`
    );
    hasAnsweredReferral = false;
  }

  res.json({
    status: 200,
    content: {
      KID: donationObject.KID,
      donorID: donationObject.donorID,
      hasAnsweredReferral,
      paymentProviderUrl,
    },
  });
});

/**
 * @openapi
 * /donations/bank/pending:
 *   post:
 *    tags: [Donations]
 *    description: Registers a pending bank donation (sends an email with a notice to pay)
 */
router.post("/bank/pending", urlEncodeParser, async (req, res, next) => {
  let parsedData = JSON.parse(req.body.data);

  if (config.env === "production")
    var success = await sendDonationRegistered(parsedData.KID, parsedData.sum);
  else success = true;

  if (success) res.json({ status: 200, content: "OK" });
  else
    res.status(500).json({
      status: 500,
      content: "Could not send bank donation pending email",
    });
});

/**
 * @openapi
 * /donations/confirm:
 *   post:
 *    tags: [Donations]
 *    description: Adds a confirmed donation to the database
 */
router.post(
  "/confirm",
  authMiddleware.isAdmin,
  urlEncodeParser,
  async (req, res, next) => {
    try {
      let sum = Number(req.body.sum);
      let timestamp = new Date(req.body.timestamp);
      let KID = req.body.KID;
      let methodId = Number(req.body.paymentId);
      let externalRef = req.body.paymentExternalRef;
      let metaOwnerID = req.body.metaOwnerID;

      let donationID = await DAO.donations.add(
        KID,
        methodId,
        sum,
        timestamp,
        externalRef,
        metaOwnerID
      );

      if (config.env === "production" && req.body.reciept === true)
        await sendDonationReciept(donationID);

      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donations/total:
 *   get:
 *    tags: [Donations]
 *    description: Get aggregated donations in a date range, by organizations
 */
router.get("/total", async (req, res, next) => {
  try {
    let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req);

    let aggregate = await DAO.donations.getAggregateByTime(
      dates.fromDate,
      dates.toDate
    );

    res.json({
      status: 200,
      content: aggregate,
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /donations/total:
 *   get:
 *    tags: [Donations]
 *    description: Get aggregated donations by month for last 12 months
 */
router.get("/total/monthly", async (req, res, next) => {
  try {
    let aggregate = await DAO.donations.getAggregateLastYearByMonth();

    res.json({
      status: 200,
      content: aggregate,
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /donations/total:
 *   get:
 *    tags: [Donations]
 *    description: Get the median donation
 */
router.get("/median", cache("5 minutes"), async (req, res, next) => {
  try {
    let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req);

    let median = await DAO.donations.getMedianFromRange(
      dates.fromDate,
      dates.toDate
    );

    if (median == null) {
      return res.json({
        status: 404,
        content: "No donations found in range",
      });
    }

    res.json({
      status: 200,
      content: median,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var results = await DAO.donations.getAll(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter
    );
    return res.json({
      status: 200,
      content: {
        rows: results.rows,
        pages: results.pages,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/histogram", async (req, res, next) => {
  try {
    let buckets = await DAO.donations.getHistogramBySum();

    res.json({
      status: 200,
      content: buckets,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/transaction_costs_report",  authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const donations = await DAO.donations.getTransactionCostsReport();
    return res.json({
      status: 200,
      content: donations,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/reciepts", authMiddleware.isAdmin, async (req, res, next) => {
  let donationIDs = req.body.donationIDs;

  try {
    for (let i = 0; i < donationIDs.length; i++) {
      let donationID = donationIDs[i];

      var mailStatus = await sendDonationReciept(donationID);

      if (mailStatus == false)
        console.error(`Failed to send donation for donationID ${donationID}`);
    }

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.get(
  "/externalID/:externalID/:methodID",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      let donation = await DAO.donations.getByExternalPaymentID(
        req.params.externalID,
        req.params.methodID
      );

      return res.json({
        status: 200,
        content: donation,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

let historyRateLimit = new rateLimit({
  windowMs: 60 * 1000 * 60, // 1 hour
  max: 5,
  delayMs: 0, // disable delaying - full speed until the max limit is reached
});
router.post("/history/email", historyRateLimit, async (req, res, next) => {
  try {
    let email = req.body.email;
    let id = await DAO.donors.getIDbyEmail(email);

    if (id != null) {
      var mailsent = await sendDonationHistory(id);
      if (mailsent) {
        res.json({
          status: 200,
          content: "ok",
        });
      }
    } else {
      res.json({
        status: 200,
        content: "ok",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * tags:
 *   - name: Donations
 *     description: Donations in the database
 */

/**
 * @openapi
 * /donations/{id}:
 *   get:
 *    tags: [Donations]
 *    description: Get get a donation by id
 *    responses:
 *      200:
 *        description: Returns a donation object
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content:
 *                        $ref: '#/components/schemas/Donation'
 *                   example:
 *                      content:
 *                        $ref: '#/components/schemas/Donation/example'
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donation with given id not found
 */
router.get("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var donation = await DAO.donations.getByID(req.params.id);

    return res.json({
      status: 200,
      content: donation,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/all/:kid", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const donations = await DAO.donations.getAllByKID(req.params.kid);
    return res.json({
      status: 200,
      content: donations,
    });
  } catch (ex) {
    next(ex);
  }
});

router.put(
  "/transaction_cost/:donationID",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      let result = await DAO.donations.updateTransactionCost(
        req.body.transactionCost,
        req.params.donationID
      );

      if (result) {
        return res.json({
          status: 200,
        });
      } else {
        throw new Error(
          `Could not update transaction cost for donation ID ${req.params.donationID}`
        );
      }
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donations/{id}:
 *   delete:
 *    tags: [Donations]
 *    description: Delete a donation by id
 *    responses:
 *      200:
 *        description: Donation was deleted
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: boolean
 *                   example:
 *                      content: true
 *
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donation with given id not found
 */
router.delete("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var removed = await DAO.donations.remove(req.params.id);

    if (removed) {
      return res.json({
        status: 200,
        content: removed,
      });
    } else {
      throw new Error("Could not remove donation");
    }
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /donations/{id}/reciept:
 *   post:
 *    tags: [Donations]
 *    description: Sends a reciept for the donation to the email associated with the donor
 *    responses:
 *      200:
 *        description: Reciept sent
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: boolean
 *                   example:
 *                      content: "Receipt sent for donation id 99"
 *
 *      401:
 *        description: User not authorized to access endpoint
 *      404:
 *        description: Donation with given id not found
 *      500:
 *        description: Failed to send donation reciept. Returns the error code from the request to mailgun (our email service).
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: boolean
 *                   example:
 *                      status: 500
 *                      content: "Receipt failed with error code 401"
 */
router.post("/:id/receipt", authMiddleware.isAdmin, async (req, res, next) => {
  if (req.body.email && req.body.email.indexOf("@") > -1) {
    var mailStatus = await sendDonationReciept(req.params.id, req.body.email);
  } else {
    var mailStatus = await sendDonationReciept(req.params.id);
  }

  if (mailStatus === true) {
    res.json({
      status: 200,
      content: `Receipt sent for donation id ${req.params.id}`,
    });
  } else {
    res.json({
      status: 500,
      content: `Receipt failed with error code ${mailStatus}`,
    });
  }
});

module.exports = router;
