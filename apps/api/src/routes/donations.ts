import * as express from "express";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendDonationReceipt } from "../custom_modules/mail";
import bodyParser from "body-parser";
import apicache from "apicache";
import { confirmDonation, updateDonation } from "../custom_modules/donationsService";
import { localeMiddleware, LocaleRequest } from "../middleware/locale";
import { exportCsv } from "../custom_modules/csvexport";
import { describeIssues, registerDonationSchema } from "../schemas/publicRequests";
import {
  PendingDonationResult,
  registerPendingDonation,
} from "../custom_modules/pendingDonationRegistration";

const router = express.Router();
const urlEncodeParser = bodyParser.urlencoded({ extended: true });
const cache = apicache.middleware;

const dateRangeHelper = require("../custom_modules/dateRangeHelper");

router.get("/status", async (req, res, next) => {
  try {
    if (req.query.status && (req.query.status as string).toUpperCase() === "OK")
      res.redirect("https://gieffektivt.no/donasjon-mottatt");
    else res.redirect("https://gieffektivt.no/donasjon-feilet");
  } catch (ex) {
    next({ ex });
  }
});

router.post("/register", async (req, res, next) => {
  const parsed = registerDonationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 400, content: describeIssues(parsed.error) });
  }
  const parsedData = parsed.data;

  let result: PendingDonationResult;
  try {
    result = await registerPendingDonation(parsedData);
  } catch (ex) {
    return next(ex);
  }
  if (!result.ok) return res.status(400).send(result.message);

  res.json({
    status: 200,
    content: result.content,
  });
});

router.put("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    // Verify donation id as number
    const donationId = parseInt(req.params.id);
    if (isNaN(donationId)) return res.status(400).send("Invalid donation ID");

    const existingDonation = await DAO.donations.getByID(donationId);
    if (!existingDonation) return res.status(404).send("Donation not found");

    await updateDonation(
      existingDonation,
      {
        paymentId: req.body.paymentId,
        paymentExternalRef: req.body.paymentExternalRef,
        sum: req.body.sum,
        transactionCost: req.body.transactionCost,
        timestamp: new Date(req.body.timestamp),
        metaOwnerId: req.body.metaOwnerId,
      },
      req.body.distribution,
    );

    return res.json({
      status: 200,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/confirm", authMiddleware.isAdmin, urlEncodeParser, async (req, res, next) => {
  try {
    let sum = Number(req.body.sum);
    let timestamp = new Date(req.body.timestamp);
    let KID = req.body.KID;
    let methodId = Number(req.body.paymentId);
    let externalRef = req.body.paymentExternalRef;
    let metaOwnerID = req.body.metaOwnerID;

    await confirmDonation({
      KID,
      paymentMethodId: methodId,
      sum,
      timestamp,
      externalRef,
      metaOwnerId: metaOwnerID,
      sendReceipt: req.body.reciept === true,
    });

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

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

router.post("/:id/receipt", authMiddleware.isAdmin, async (req, res) => {
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
