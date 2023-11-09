import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";

import express from "express";
import { findGlobalHealthCauseAreaOrThrow } from "../custom_modules/distribution";
import { sumWithPrecision } from "../custom_modules/rounding";
const router = express.Router();

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

    if (sumWithPrecision(shares.map((share) => share.share)) !== "100") {
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

    const causeArea = findGlobalHealthCauseAreaOrThrow(distribution);

    return res.json({
      status: 200,
      content: {
        KID: req.params.KID,
        donor,
        taxUnit,
        standardDistribution: causeArea.standardSplit,
        shares: causeArea.organizations.map((org) => ({
          full_name: org.name,
          abbriv: org.name,
          id: org.id,
          share: org.percentageShare,
        })),
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
      let { distributions, donorID } = await DAO.distributions.getAllByDonor(req.params.donorID);

      type BackwardsCompatibleResponse = {
        status: 200;
        content: {
          donorID: number;
          distributions: Array<{
            kid: string;
            shares: Array<{
              id: number;
              name: string;
              share: string;
            }>;
          }>;
        };
      };

      return res.json({
        status: 200,
        content: {
          donorID,
          distributions: distributions.map((distribution) => ({
            kid: distribution.kid,
            shares: findGlobalHealthCauseAreaOrThrow(distribution).organizations.map((org) => ({
              id: org.id,
              name: org.name,
              share: org.percentageShare,
            })),
          })),
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
  },
);

module.exports = router;
