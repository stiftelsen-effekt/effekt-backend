import * as express from "express";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";
import {
  sendAutoGiroRegistered,
  sendDonationReceipt,
  sendDonationRegistered,
} from "../custom_modules/mail";
import * as swish from "../custom_modules/swish";
import methods from "../enums/methods";
import bodyParser from "body-parser";
import apicache from "apicache";
import { Distribution, DistributionCauseArea, DistributionInput } from "../schemas/types";
import { validateDistribution } from "../custom_modules/distribution";
import { localeMiddleware, LocaleRequest } from "../middleware/locale";
import { exportCsv } from "../custom_modules/csvexport";

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
    recurring: boolean;
    amount: string | number;
    fundraiser?: {
      id: number;
      message?: string;
      messageSenderName?: string;
      showName: boolean;
    };
  };

  // Validate input
  if (!parsedData.distributionCauseAreas || parsedData.distributionCauseAreas.length === 0)
    return res.status(400).send("No cause areas provided");
  if (parsedData.donor && !parsedData.donor.email)
    return res.status(400).send("Invalid donor data");
  if (!parsedData.method) return res.status(400).send("No payment method provided");
  if (!parsedData.amount) return res.status(400).send("No amount provided");

  if (parsedData.method === methods.SWISH) {
    if (parsedData.recurring)
      return res.status(400).send("Recurring donations not supported with Swish");
  }

  if (parsedData.fundraiser) {
    if (!parsedData.fundraiser.id) return res.status(400).send("No fundraiser ID provided");
    if (typeof parsedData.fundraiser.showName === "undefined")
      return res.status(400).send("No showName provided");
  }

  let donor = parsedData.donor;
  let paymentProviderUrl = "";
  let swishOrderID = null;
  let swishPaymentRequestToken = null;
  let recurring = parsedData.recurring;
  const fundraiser = parsedData.fundraiser;

  try {
    var donationObject: Pick<typeof parsedData, "amount" | "method" | "recurring"> & {
      KID: string;
      donorID: number | null;
      taxUnitId: number;
      fundraiserTransactionId: number | null;
    } = {
      amount: parsedData.amount,
      method: parsedData.method,
      recurring: parsedData.recurring,
      KID: null, //Set later in code
      donorID: null, //Set later in code
      taxUnitId: null, //Set later in code
      fundraiserTransactionId: null,
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
      } else {
        causeArea.organizations = causeArea.organizations.filter(
          (o) => parseFloat(o.percentageShare) > 0,
        );
      }
    }

    /** Use new KID for avtalegiro */
    if (donationObject.method == methods.AVTALEGIRO) {
      if (fundraiser) {
        return res.status(400).send("Fundraisers are not supported with AvtaleGiro");
      }

      //Create unique KID for each AvtaleGiro to prevent duplicates causing conflicts
      donationObject.KID = await donationHelpers.createAvtaleGiroKID();
      await DAO.distributions.add({
        ...draftDistribution,
        kid: donationObject.KID,
      });
    } else if (donationObject.method == methods.AUTOGIRO) {
      if (fundraiser) {
        return res.status(400).send("Fundraisers are not supported with AutoGiro");
      }

      donationObject.KID = await donationHelpers.createKID(8);
      await DAO.distributions.add({
        ...draftDistribution,
        kid: donationObject.KID,
      });

      // Draft AutoGiro
      await DAO.autogiroagreements.draftAgreement({
        KID: donationObject.KID,
        amount:
          typeof donationObject.amount === "string"
            ? parseFloat(donationObject.amount)
            : donationObject.amount,
        payment_date: 27,
      });

      try {
        await sendAutoGiroRegistered(donationObject.KID, donor.email);
      } catch (ex) {
        console.error(`Failed to send AutoGiro registered email for KID ${donationObject.KID}`);
      }
    } else {
      //Try to get existing KID if not a fundraiser
      // For fundraisers, we always create a new KID to store the message and fundraiser ID
      if (!fundraiser) {
        donationObject.KID = await DAO.distributions.getKIDbySplit(
          {
            donorId: donationObject.donorID,
            taxUnitId: donationObject.taxUnitId,
            causeAreas: draftDistribution.causeAreas,
          },
          0,
          8,
        );
      }

      //Split does not exist create new KID and split
      if (donationObject.KID == null) {
        if (fundraiser) {
          // Add a fundraiser transaction ID to store the fundraiser ID and message
          donationObject.fundraiserTransactionId = await DAO.fundraisers.addFundraiserTransaction({
            fundraiserId: fundraiser.id,
            message: fundraiser.message,
            messageSenderName: fundraiser.messageSenderName,
            showName: fundraiser.showName,
          });
        }

        donationObject.KID = await donationHelpers.createKID();

        let distribution: Distribution = {
          kid: donationObject.KID,
          fundraiserTransactionId: donationObject.fundraiserTransactionId ?? null,
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
            amount:
              typeof donationObject.amount === "string"
                ? parseInt(donationObject.amount)
                : donationObject.amount,
          });
          swishOrderID = res.orderID;
          swishPaymentRequestToken = res.paymentRequestToken;
        }
        break;
      }
    }

    try {
      await DAO.initialpaymentmethod.addPaymentIntent(
        donationObject.amount,
        donationObject.method,
        donationObject.KID,
      );
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
      swishOrderID,
      swishPaymentRequestToken,
    },
  });
});

router.put("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    // Verify donation id as number
    const donationId = parseInt(req.params.id);
    if (isNaN(donationId)) return res.status(400).send("Invalid donation ID");

    const existingDonation = await DAO.donations.getByID(donationId);
    if (!existingDonation) return res.status(404).send("Donation not found");

    await DAO.donations.update({
      id: req.params.id,
      paymentId: req.body.paymentId,
      paymentExternalRef: req.body.paymentExternalRef,
      sum: req.body.sum,
      transactionCost: req.body.transactionCost,
      timestamp: new Date(req.body.timestamp),
      metaOwnerId: req.body.metaOwnerId,
    });

    if (req.body.distribution) {
      const validatedDistribution = validateDistribution(req.body.distribution);

      if (!("kid" in validatedDistribution)) {
        throw new Error("Distribution does not have a KID");
      }

      const existingBySplitKID = await DAO.distributions.getKIDbySplit(validatedDistribution);

      if (existingBySplitKID != null && existingBySplitKID === validatedDistribution.kid) {
        // No change
      } else if (existingBySplitKID != null) {
        // Use an existing KID for a distribution matching the split
        await DAO.donations.updateKIDById(req.params.id, existingBySplitKID);
      } else {
        // Create a new KID and distribution
        const newKid = await donationHelpers.createKID();
        await DAO.distributions.add({
          ...validatedDistribution,
          // Overwrite the KID with the new one
          kid: newKid,
        });
        await DAO.donations.updateKIDById(req.params.id, newKid);
      }

      if (validatedDistribution.donorId !== existingDonation.donorId) {
        console.log("UPDATE DONOR ID");
        await DAO.donations.updateDonorId(donationId, validatedDistribution.donorId);
      }
    }

    return res.json({
      status: 200,
    });
  } catch (ex) {
    next(ex);
  }
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

router.post(
  "/",
  authMiddleware.isAdmin,
  localeMiddleware,
  async (req: LocaleRequest, res, next) => {
    try {
      if (req.body.export === true) {
        const results = await DAO.donations.getAll(
          req.body.sort,
          0,
          Number.MAX_SAFE_INTEGER,
          req.body.filter,
          req.locale,
        );

        return exportCsv(res, results.rows, `donations-${new Date().toISOString()}.csv`);
      }

      if (typeof req.body.page === "undefined" || typeof req.body.limit === "undefined") {
        return res.status(400).json({
          status: 400,
          content: "Missing required fields: page, limit",
        });
      }

      var results = await DAO.donations.getAll(
        req.body.sort,
        req.body.page,
        req.body.limit,
        req.body.filter,
        req.locale,
      );
      return res.json({
        status: 200,
        content: {
          rows: results.rows,
          pages: results.pages,
          statistics: results.statistics,
        },
      });
    } catch (ex) {
      next(ex);
    }
  },
);

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
 *        description: Failed to send donation reciept. Returns the error code from the request to mailersend (our email service).
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
router.post("/:id/receipt", async (req, res, next) => {
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
