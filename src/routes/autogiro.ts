import * as express from "express";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import permissions from "../enums/authorizationPermissions";
import { processAutogiroInputFile } from "../custom_modules/autogiro";
import {
  checkDonorOwnsDistribution,
  isAdmin,
} from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import { localeMiddleware } from "../middleware/locale";
import { DistributionInput } from "../schemas/types";
import { validateDistribution } from "../custom_modules/distribution";
import { donationHelpers } from "../custom_modules/donationHelpers";

const router = express.Router();

router.post("/reports/process", isAdmin, async (req, res) => {
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
    const file = await DAO.logging.getAutoGiroShipmentFile(parseInt(req.params.id));

    if (file) {
      return res.json({
        status: 200,
        content: {
          file: file.fileContents,
          filename: file.filename,
        },
      });
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

router.get("/agreement/:id", isAdmin, localeMiddleware, async (req, res, next) => {
  try {
    const agreement = await DAO.autogiroagreements.getAgreementById(req.params.id);

    if (agreement) {
      const distribution = await DAO.distributions.getSplitByKID(agreement.KID);
      const taxUnit = await DAO.tax.getByKID(agreement.KID, req.locale);
      const donor = await DAO.donors.getByKID(agreement.KID);

      return res.json({
        status: 200,
        content: {
          ...agreement,
          distribution,
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

router.get("/donations/:KID", isAdmin, async (req, res, next) => {
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

router.post("/mandates", isAdmin, async (req, res, next) => {
  try {
    var results = await DAO.autogiroagreements.getMandates(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
    );
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

router.put(
  "/:KID/",
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    const agreementChanges = req.body as {
      paymentDate: number | null;
      amount: number | null;
      distribution: DistributionInput | null;
    };

    console.log(agreementChanges);

    try {
      const originalKID: string = req.params.KID;
      let validatedDistribtion: DistributionInput | null = null;
      if (agreementChanges.distribution !== null) {
        try {
          validatedDistribtion = validateDistribution(agreementChanges.distribution);
        } catch (ex) {
          return res.status(400).json({
            status: 400,
            content: "Invalid distribution",
          });
        }
      }

      if (agreementChanges.amount !== null && typeof agreementChanges.amount !== "number") {
        return res.status(400).json({
          status: 400,
          content: "Invalid amount",
        });
      }

      if (agreementChanges.paymentDate !== null) {
        if (typeof agreementChanges.paymentDate !== "number") {
          return res.status(400).json({
            status: 400,
            content: "Invalid payment date",
          });
        } else if (agreementChanges.paymentDate < 0 || agreementChanges.paymentDate > 28) {
          return res.status(400).json({
            status: 400,
            content: "Invalid payment date (must be between 0 and 28)",
          });
        }
      }

      if (agreementChanges.amount !== null) {
        if (agreementChanges.amount > 0) {
          await DAO.autogiroagreements.setAgreementAmountByKID(
            originalKID,
            agreementChanges.amount,
          );
        }
      }

      if (agreementChanges.paymentDate !== null) {
        // Payment day 0 is last day of month
        await DAO.autogiroagreements.setAgreementPaymentDateByKID(
          originalKID,
          agreementChanges.paymentDate,
        );
      }

      if (validatedDistribtion) {
        const originalDistribution = await DAO.distributions.getSplitByKID(originalKID);
        const newKid = await donationHelpers.createKID();
        await DAO.autogiroagreements.replaceAgreementDistribution(
          originalDistribution,
          newKid,
          validatedDistribtion,
        );
      }
      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  },
);

router.put(
  "/:KID/cancel",
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const originalKID: string = req.params.KID;
      await DAO.autogiroagreements.cancelAgreementByKID(originalKID);
      res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  },
);

router.put("/:KID/drafted/paymentdate", async (req, res, next) => {
  try {
    const paymentDate = req.body.paymentDate;

    if (typeof paymentDate !== "number") {
      return res.status(400).json({
        status: 400,
        content: "Invalid payment date",
      });
    }
    if (paymentDate < 0 || paymentDate > 28) {
      return res.status(400).json({
        status: 400,
        content: "Invalid payment date (must be between 0 and 28)",
      });
    }

    const agreement = await DAO.autogiroagreements.getAgreementByKID(req.params.KID);

    if (agreement.active === false) {
      await DAO.autogiroagreements.setAgreementPaymentDateByKID(req.params.KID, paymentDate);
    } else {
      return res.status(400).json({
        status: 400,
        content: "Agreement is not in drafted state",
      });
    }

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
