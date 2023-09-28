import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";

import express from "express";
const router = express.Router();

const rounding = require("../custom_modules/rounding");

router.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (
      req.body.standardDistribution === null ||
      typeof req.body.standardDistribution === "undefined"
    ) {
      return res.status(400).json({
        status: 400,
        content: "Missing param standard distribution",
      });
    }
    if (!req.body.donor || !req.body.donor.id) {
      return res.status(400).json({
        status: 400,
        content: "Missing param donor ID",
      });
    }
    if (!req.body.shares) {
      return res.status(400).json({
        status: 400,
        content: "Missing param distribution",
      });
    }

    const standardDistribution = req.body.standardDistribution;
    const donorId = req.body.donor.id;
    const metaOwnerID = req.body.metaOwnerID;
    const taxUnitId = req.body.taxUnit ? req.body.taxUnit.id : null;
    const shares = req.body.shares;

    if (shares.length === 0) {
      return res.status(400).json({
        status: 400,
        content: "Distribution must contain at least one organization",
      });
    }

    if (rounding.sumWithPrecision(shares.map((share) => share.share)) !== "100") {
      let err = new Error("Distribution does not sum to 100");
      (err as any).status = 400;
      return next(err);
    }

    //Check for existing distribution with that KID
    let foundMatchingDistribution = false;
    /*
    !!! === CAUSE AREAS TODO === !!!
    let KID = await DAO.distributions.getKIDbySplit(
      shares,
      donorId,
      standardDistribution,
      taxUnitId,
    );
    */
    let KID = null;

    if (!KID) {
      KID = await donationHelpers.createKID(15, donorId);

      throw new Error("KID generation not implemented yet");
      /*
      !!! === CAUSE AREAS TODO === !!!
      await DAO.distributions.add(
        shares,
        KID,
        donorId,
        taxUnitId,
        standardDistribution,
        metaOwnerID,
      );
      */
    } else {
      foundMatchingDistribution = true;
    }

    res.json({
      status: 200,
      content: {
        KID,
        newDistribution: !foundMatchingDistribution,
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

router.get("/:KID", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (!req.params.KID) res.status(400).json({ status: 400, content: "No KID provided" });
    const distribution = await DAO.distributions.getSplitByKID(req.params.KID);
    const taxUnit = await DAO.tax.getByKID(req.params.KID);
    const donor = await DAO.donors.getByKID(req.params.KID);

    type BackwardsCompatibleResponse = {
      status: 200;
      content: {
        KID: string;
        donor: unknown;
        taxUnit: unknown;
        standardDistribution: boolean;
        shares: Array<{
          full_name: string;
          abbriv: string;
          id: number;
          share: string;
        }>;
      };
    };

    return res.json({
      status: 200,
      content: {
        KID: req.params.KID,
        donor,
        taxUnit,
        distribution,
      },
    } satisfies BackwardsCompatibleResponse);
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
});

router.get(
  "/all/:donorID",
  authMiddleware.isAdmin,
  (req, res, next) => {
    authMiddleware.checkAdminOrTheDonor(parseInt(req.params.donorID), req, res, next);
  },
  async (req, res, next) => {
    try {
      if (!req.params.donorID) res.status(400).json({ status: 400, content: "No KID provided" });
      let distributions = await DAO.distributions.getAllByDonor(req.params.donorID);

      /**
       * Cause Areas Todo: Not backwards compatible with old distributions object
       */
      throw new Error("Not backwards compatible with old distributions object");

      type BackwardsCompatibleResponse = {
        status: 200;
        content: Array<{
          donorID: number;
          distributions: Array<{
            kid: string;
            shares: Array<{
              id: number;
              name: string;
              share: string;
            }>;
          }>;
        }>;
      };

      return res.json({
        status: 200,
        content: distributions,
      } satisfies BackwardsCompatibleResponse);
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
