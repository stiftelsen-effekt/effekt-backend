import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";

import express from "express";
import { validateDistribution } from "../custom_modules/distribution";
import { sumWithPrecision } from "../custom_modules/rounding";
import { LocaleRequest, localeMiddleware } from "../middleware/locale";
import { DistributionInput } from "../schemas/types";
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
    let limit = req.body.limit,
      page = req.body.page,
      filter = req.body.filter,
      sort = req.body.sort;

    let distributions = await DAO.distributions.getAll(page, limit, sort, filter);

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
