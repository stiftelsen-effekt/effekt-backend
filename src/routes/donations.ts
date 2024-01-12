import * as express from "express";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";
import {
  sendDonationHistory,
  sendDonationReceipt,
  sendDonationRegistered,
} from "../custom_modules/mail";
import * as swish from "../custom_modules/swish";
import rateLimit from "express-rate-limit";
import methods from "../enums/methods";
import bodyParser from "body-parser";
import apicache from "apicache";
import { Distribution, DistributionCauseArea, DistributionInput } from "../schemas/types";
import { GLOBAL_HEALTH_CAUSE_AREA_ID } from "../custom_modules/distribution";

const config = require("../config");

const router = express.Router();
const urlEncodeParser = bodyParser.urlencoded({ extended: true });
const cache = apicache.middleware;

const vipps = require("../custom_modules/vipps");
const dateRangeHelper = require("../custom_modules/dateRangeHelper");

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
  let parsedData = req.body as {
    distributionCauseAreas: DistributionCauseArea[];
    donor: {
      email: string;
      name: string;
      newsletter: boolean;
      ssn?: string;
    };
    method: number;
    phone?: string;
    recurring: boolean;
    amount: string | number;
  };

  if (!parsedData || Object.entries(parsedData).length === 0) return res.sendStatus(400);

  if (parsedData.method === methods.SWISH) {
    if (!parsedData.phone) return res.status(400).send("Missing phone number");
    if (!parsedData.phone.startsWith("467"))
      return res.status(400).send("Invalid phone number format");
    if (parsedData.recurring)
      return res.status(400).send("Recurring donations not supported with Swish");
  }

  let donor = parsedData.donor;
  let paymentProviderUrl = "";
  let orderID = null;
  let recurring = parsedData.recurring;

  try {
    var donationObject: Pick<typeof parsedData, "amount" | "method" | "recurring"> & {
      KID: string;
      donorID: number | null;
      taxUnitId: number;
    } = {
      amount: parsedData.amount,
      method: parsedData.method,
      recurring: parsedData.recurring,
      KID: null, //Set later in code
      donorID: null, //Set later in code
      taxUnitId: null, //Set later in code
    };

    //Check if existing donor
    donationObject.donorID = await DAO.donors.getIDbyEmail(donor.email);

    if (donationObject.donorID == null) {
      //Donor does not exist, create donor
      donationObject.donorID = await DAO.donors.add({
        email: donor.email,
        full_name: donor.name,
        newsletter: donor.newsletter,
      });
      if (donor.ssn != null && donor.ssn !== "") {
        donationObject.taxUnitId = await DAO.tax.addTaxUnit(
          donationObject.donorID,
          donor.ssn,
          donor.name,
        );
      } else {
        donationObject.taxUnitId = null;
      }
    } else {
      //Check for existing tax unit if SSN provided
      if (typeof donor.ssn !== "undefined" && donor.ssn != null && donor.ssn !== "") {
        const existingTaxUnit = await DAO.tax.getByDonorIdAndSsn(donationObject.donorID, donor.ssn);

        if (existingTaxUnit) {
          donationObject.taxUnitId = existingTaxUnit.id;
        } else {
          donationObject.taxUnitId = await DAO.tax.addTaxUnit(
            donationObject.donorID,
            donor.ssn,
            donor.name,
          );
        }
      }

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
          await DAO.donors.updateNewsletter(donationObject.donorID, donor.newsletter);
        }
      }
    }

    /* Construct distribution object */
    const draftDistribution: DistributionInput = {
      donorId: donationObject.donorID,
      taxUnitId: donationObject.taxUnitId,
      causeAreas: parsedData.distributionCauseAreas,
    };

    /* Get the standard shares of the organizations for all cause areas with standard split */
    for (const causeArea of draftDistribution.causeAreas) {
      if (causeArea.standardSplit) {
        const standardShareOrganizations =
          await DAO.distributions.getStandardDistributionByCauseAreaID(causeArea.id);
        causeArea.organizations = standardShareOrganizations;
      }
    }

    /** Use new KID for avtalegiro */
    if (donationObject.method == methods.BANK && donationObject.recurring == true) {
      //Create unique KID for each AvtaleGiro to prevent duplicates causing conflicts
      donationObject.KID = await donationHelpers.createAvtaleGiroKID();
      // !!--!! ================================================= TAX UNIT
      await DAO.distributions.add({
        ...draftDistribution,
        kid: donationObject.KID,
      });
    } else {
      //Try to get existing KID
      donationObject.KID = await DAO.distributions.getKIDbySplit({
        donorId: donationObject.donorID,
        taxUnitId: donationObject.taxUnitId,
        causeAreas: draftDistribution.causeAreas,
      });

      //Split does not exist create new KID and split
      if (donationObject.KID == null) {
        donationObject.KID = await donationHelpers.createKID();

        const distribution: Distribution = {
          kid: donationObject.KID,
          ...draftDistribution,
        };

        await DAO.distributions.add(distribution);
      }
    }

    switch (donationObject.method) {
      case methods.VIPPS: {
        if (recurring == false) {
          const res = await vipps.initiateOrder(donationObject.KID, donationObject.amount);
          paymentProviderUrl = res.externalPaymentUrl;

          //Start polling for updates (move this to inside initiateOrder?)
          vipps.pollOrder(res.orderId);
        }
        break;
      }
      case methods.SWISH: {
        if (recurring == false) {
          const res = await swish.initiateOrder(donationObject.KID, {
            phone: parsedData.phone,
            amount:
              typeof donationObject.amount === "string"
                ? parseInt(donationObject.amount)
                : donationObject.amount,
          });
          orderID = res.orderID;
        }
        break;
      }
    }

    try {
      await DAO.initialpaymentmethod.addPaymentIntent(donationObject.KID, donationObject.method);
    } catch (error) {
      console.error(error);
    }
  } catch (ex) {
    return next(ex);
  }

  try {
    var hasAnsweredReferral = await DAO.referrals.getDonorAnswered(donationObject.donorID);
  } catch (ex) {
    console.error(
      `Could not get whether donor answered referral for donorID ${donationObject.donorID}`,
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
      swishOrderID: orderID,
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

  if (config.env === "production" || true)
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
router.post("/confirm", authMiddleware.isAdmin, urlEncodeParser, async (req, res, next) => {
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
      metaOwnerID,
    );

    if (config.env === "production" && req.body.reciept === true)
      await sendDonationReceipt(donationID);

    res.json({
      status: 200,
      content: "OK",
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
 *    description: Get aggregated donations in a date range, by organizations
 */
router.get("/total", async (req, res, next) => {
  try {
    let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req);

    let aggregate = await DAO.donations.getAggregateByTime(dates.fromDate, dates.toDate);

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

    let median = await DAO.donations.getMedianFromRange(dates.fromDate, dates.toDate);

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
      req.body.filter,
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

router.get("/transaction_costs_report", authMiddleware.isAdmin, async (req, res, next) => {
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

      var mailStatus = await sendDonationReceipt(donationID);

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

router.get("/externalID/:externalID/:methodID", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let donation = await DAO.donations.getByExternalPaymentID(
      req.params.externalID,
      req.params.methodID,
    );

    return res.json({
      status: 200,
      content: donation,
    });
  } catch (ex) {
    next(ex);
  }
});

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

router.put("/transaction_cost/:donationID", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let result = await DAO.donations.updateTransactionCost(
      req.body.transactionCost,
      req.params.donationID,
    );

    if (result) {
      return res.json({
        status: 200,
      });
    } else {
      throw new Error(`Could not update transaction cost for donation ID ${req.params.donationID}`);
    }
  } catch (ex) {
    next(ex);
  }
});

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
    var mailStatus = await sendDonationReceipt(req.params.id, req.body.email);
  } else {
    var mailStatus = await sendDonationReceipt(req.params.id);
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

export default router;
