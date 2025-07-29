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
import { exportCsv } from "../custom_modules/csvexport";

const router = express.Router();

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
    if (req.body.export === true) {
      const results = await DAO.autogiroagreements.getAgreements(
        req.body.sort,
        0,
        Number.MAX_SAFE_INTEGER,
        req.body.filter,
      );

      return exportCsv(res, results.rows, `autogiro-agreements-${new Date().toISOString()}.csv`);
    }

    if (typeof req.body.page === "undefined" || typeof req.body.limit === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing required fields: page, limit",
      });
    }

    var results = await DAO.autogiroagreements.getAgreements(
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
    const { KID } = req.params;
    const { paymentDate, amount, distribution } = req.body as {
      paymentDate?: number | null;
      amount?: number | null;
      distribution?: DistributionInput | null;
    };

    try {
      // Validate distribution
      let validatedDistribution: DistributionInput | null = null;
      if (distribution !== null) {
        try {
          validatedDistribution = validateDistribution(distribution);
        } catch (ex) {
          return res.status(400).json({
            status: 400,
            content: "Invalid distribution",
          });
        }
      }

      // Validate and update amount
      if (amount !== null && amount !== undefined) {
        if (typeof amount !== "number" || amount <= 0) {
          return res.status(400).json({
            status: 400,
            content: "Invalid amount: must be a positive number",
          });
        }
        await DAO.autogiroagreements.setAgreementAmountByKID(KID, amount);
      }

      // Validate and update payment date
      if (paymentDate !== null && paymentDate !== undefined) {
        if (!Number.isInteger(paymentDate) || paymentDate < 0 || paymentDate > 28) {
          return res.status(400).json({
            status: 400,
            content: "Invalid payment date: must be an integer between 0 and 28",
          });
        }
        await DAO.autogiroagreements.setAgreementPaymentDateByKID(KID, paymentDate);
      }

      // Update distribution
      if (validatedDistribution) {
        const originalDistribution = await DAO.distributions.getSplitByKID(KID);
        const newKid = await donationHelpers.createKID();
        await DAO.autogiroagreements.replaceAgreementDistribution(
          originalDistribution,
          newKid,
          validatedDistribution,
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

router.post("/:KID/paymentdate", authMiddleware.isAdmin, async (req, res, next) => {
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

    if (!agreement) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

    await DAO.autogiroagreements.setAgreementPaymentDateByKID(req.params.KID, paymentDate);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/:KID/amount", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const amount = req.body.amount / 100; /* Amount is sent as øre but stored as kroner */

    if (typeof amount !== "number") {
      return res.status(400).json({
        status: 400,
        content: "Invalid amount",
      });
    }

    const agreement = await DAO.autogiroagreements.getAgreementByKID(req.params.KID);

    if (!agreement) {
      return res.status(404).json({
        status: 404,
        content: "Agreement not found",
      });
    }

    await DAO.autogiroagreements.setAgreementAmountByKID(req.params.KID, amount);

    res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

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

router.put(
  "/:KID/activate",
  authMiddleware.auth(permissions.write_agreements),
  (req, res, next) => {
    checkDonorOwnsDistribution(req.params.KID, req, res, next);
  },
  async (req, res, next) => {
    try {
      const originalKID: string = req.params.KID;
      await DAO.autogiroagreements.activateAgreementByKID(originalKID);
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
