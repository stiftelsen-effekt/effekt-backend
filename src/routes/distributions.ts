import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";

import express from "express";
import { validateDistribution } from "../custom_modules/distribution";
import { sumWithPrecision } from "../custom_modules/rounding";
import { LocaleRequest, localeMiddleware } from "../middleware/locale";
import { DistributionInput } from "../schemas/types";
import { exportCsv } from "../custom_modules/csvexport";
const router = express.Router();

router.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    let distribution = req.body as DistributionInput;

    const validatedDistribution = validateDistribution(distribution);

    const existing = await DAO.distributions.getKIDbySplit(validatedDistribution);

    if (existing) {
      return res.json({
        status: 200,
        content: {
          KID: existing,
          newDistribution: false,
        },
      });
    }

    const KID = await donationHelpers.createKID();

    await DAO.distributions.add({
      kid: KID,
      ...validatedDistribution,
    });

    res.json({
      status: 200,
      content: {
        KID,
        newDistribution: true,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/search", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (req.body.export === true) {
      const results = await DAO.distributions.getAll(
        0,
        Number.MAX_SAFE_INTEGER,
        req.body.sort,
        req.body.filter,
      );

      return exportCsv(res, results.rows, `distributions-${new Date().toISOString()}.csv`);
    }

    if (typeof req.body.page === "undefined" || typeof req.body.limit === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing required fields: page, limit",
      });
    }

    let distributions = await DAO.distributions.getAll(
      req.body.page,
      req.body.limit,
      req.body.sort,
      req.body.filter,
    );

    res.json({
      status: 200,
      content: distributions,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get(
  "/:KID",
  authMiddleware.isAdmin,
  localeMiddleware,
  async (req: LocaleRequest, res, next) => {
    try {
      if (!req.params.KID) res.status(400).json({ status: 400, content: "No KID provided" });
      const distribution = await DAO.distributions.getSplitByKID(req.params.KID);

      return res.json({
        status: 200,
        content: {
          ...distribution,
        },
      });
    } catch (ex) {
      if (ex.message.indexOf("NOT FOUND") !== -1)
        res.status(404).send({
          status: 404,
          content: ex.message,
        });
      else {
        next(ex);
      }
    }
  },
);

router.get(
  "/all/:donorID",
  authMiddleware.isAdmin,
  (req, res, next) => {
    authMiddleware.checkAdminOrTheDonor(parseInt(req.params.donorID), req, res, next);
  },
  async (req, res, next) => {
    try {
      if (!req.params.donorID) res.status(400).json({ status: 400, content: "No KID provided" });
      let { distributions, donorID } = await DAO.distributions.getAllByDonor(req.params.donorID);

      return res.json({
        status: 200,
        content: {
          donorID,
          distributions,
        },
      });
    } catch (ex) {
      if (ex.message.indexOf("NOT FOUND") !== -1)
        res.status(404).send({
          status: 404,
          content: ex.message,
        });
      else {
        next(ex);
      }
    }
  },
);

module.exports = router;
