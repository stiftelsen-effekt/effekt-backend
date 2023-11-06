import * as express from "express";
import { AutoGiroParser } from "../custom_modules/parsers/autogiro";
import { processAutogiroInputFile } from "../custom_modules/autogiro";
import { isAdmin } from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";

const router = express.Router();

router.post("/reports/process", async (req, res) => {
  const report = req.files.report;
  if (Array.isArray(report)) {
    throw new Error("Expected a single file");
  }
  const data = report.data.toString("latin1");

  const result = await processAutogiroInputFile(data);

  res.json(result);
});

router.get("/shipments", isAdmin, async (req, res, next) => {
  try {
    const shipments = await DAO.autogiroagreements.getAllShipments();
    if (shipments) {
      return res.json({
        status: 200,
        content: shipments,
      });
    } else {
      return res.status(500).json({
        status: 500,
        content: "Error getting shipments",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.get("/shipment/:id/report", isAdmin, async (req, res, next) => {
  try {
    const fileContents = await DAO.logging.getAutoGiroShipmentFile(parseInt(req.params.id));

    if (fileContents) {
      res.setHeader("Content-Type", "text/plain");
      res.send(fileContents);
    } else {
      return res.status(500).json({
        status: 500,
        content: "Error getting shipment report",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.get("/agreement/:id", isAdmin, async (req, res, next) => {
  try {
    const agreement = await DAO.autogiroagreements.getAgreementById(req.params.id);

    if (agreement) {
      const shares = await DAO.distributions.getSplitByKID(agreement.KID);
      const taxUnit = await DAO.tax.getByKID(agreement.KID);
      const standardDistribution = await DAO.distributions.isStandardDistribution(agreement.KID);
      const donor = await DAO.donors.getByKID(agreement.KID);

      return res.json({
        status: 200,
        content: {
          ...agreement,
          distribution: {
            KID: agreement.KID,
            donor,
            taxUnit,
            standardDistribution,
            shares,
          },
        },
      });
    } else {
      return res.status(500).json({
        status: 500,
        content: "Error getting agreement",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.get("/donations/:KID", async (req, res, next) => {
  try {
    const donations = await DAO.donations.getAllByKID(req.params.KID);
    if (donations) {
      return res.json({
        status: 200,
        content: donations,
      });
    } else {
      return res.status(500).json({
        status: 500,
        content: "Error getting donations",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.post("/agreements", isAdmin, async (req, res, next) => {
  try {
    var results = await DAO.autogiroagreements.getAgreements(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
    );
    console.log(results);
    if (results) {
      return res.json({
        status: 200,
        content: {
          pages: results.pages,
          rows: results.rows,
        },
      });
    } else {
      return res.status(500).json({
        status: 500,
        content: "Error getting agreements",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.get("/histogram", async (req, res, next) => {
  try {
    let buckets = await DAO.autogiroagreements.getAgreementSumHistogram();

    res.json({
      status: 200,
      content: buckets,
    });
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
