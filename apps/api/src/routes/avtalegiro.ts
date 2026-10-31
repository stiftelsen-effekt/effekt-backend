import * as express from "express";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendAvtalegiroRegistered } from "../custom_modules/mail";
import moment from "moment";
import { LocaleRequest, localeMiddleware } from "../middleware/locale";
import { encodePlausibleData } from "../custom_modules/plausible";
import { getFundraiserRedirectUrl } from "../custom_modules/fundraiserRedirect";
import { exportCsv } from "../custom_modules/csvexport";

const router = express.Router();

router.post("/agreements", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (req.body.export === true) {
      const results = await DAO.avtalegiroagreements.getAgreements(
        req.body.sort,
        0,
        Number.MAX_SAFE_INTEGER,
        req.body.filter,
        req.locale,
      );

      return exportCsv(res, results.rows, `avtalegiro-agreements-${new Date().toISOString()}.csv`);
    }

    if (typeof req.body.page === "undefined" || typeof req.body.limit === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing required fields: page, limit",
      });
    }

    var results = await DAO.avtalegiroagreements.getAgreements(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
      req.locale,
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
 * Where Nets sends the donor back after signing (or not) the AvtaleGiro agreement. The
 * "agreement registered" email goes out the first time only, however often the URL is opened.
 */
router.get("/:KID/redirect", async (req, res, next) => {
  try {
    if (req.query.status && (req.query.status as string).toUpperCase() === "OK") {
      const agreement = await DAO.avtalegiroagreements.getByKID(req.params.KID);
      if (!agreement) return res.redirect("https://gieffektivt.no/avtale-feilet");

      if (await DAO.avtalegiroagreements.claimRegisteredMail(req.params.KID)) {
        await sendAvtalegiroRegistered(agreement);
      }

      const plausible = encodePlausibleData({
        revenue: Math.round(agreement.amount / 100).toString(),
        method: "avtalegiro",
        recurring: true,
        kid: req.params.KID,
      });
      const fundraiserTransaction = await DAO.fundraisers.getFundraiserTransactionByKID(
        req.params.KID,
      );

      if (fundraiserTransaction) {
        return res.redirect(
          await getFundraiserRedirectUrl(
            fundraiserTransaction.fundraiserId,
            plausible,
            `https://gieffektivt.no/opprettet?plausible=${plausible}`,
          ),
        );
      }

      res.redirect(`https://gieffektivt.no/opprettet?plausible=${plausible}`);
    } else res.redirect("https://gieffektivt.no/avtale-feilet");
  } catch (ex) {
    next({ ex });
  }
});

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
