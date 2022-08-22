import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

const express = require("express");
const router = express.Router();

const rounding = require("../custom_modules/rounding");
const donationHelpers = require("../custom_modules/donationHelpers");

router.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (!req.body.taxUnitId) {
      return res.status(400).json({
        status: 400,
        content: "Missing param taxUnitId",
      });
    }

    if (!req.body.standardSplit) {
      return res.status(400).json({
        status: 400,
        content: "Missing param standard split",
      });
    }
    const standardSplit = req.body.standardSplit;

    let split = req.body.distribution.map((distribution) => {
        return {
          organizationID: distribution.organizationId,
          share: distribution.share,
        };
      }),
      donorId = req.body.donor.id,
      metaOwnerID = req.body.metaOwnerID,
      taxUnitId = req.body.taxUnitId;

    if (split.length === 0) {
      let err = new Error("Empty distribution array provided");
      (err as any).status = 400;
      return next(err);
    }

    if (
      rounding.sumWithPrecision(split.map((split) => split.share)) !== "100"
    ) {
      let err = new Error("Distribution does not sum to 100");
      (err as any).status = 400;
      return next(err);
    }

    //Check for existing distribution with that KID
    let KID = await DAO.distributions.getKIDbySplit(
      split,
      donorId,
      taxUnitId,
      standardSplit
    );

    if (!KID) {
      KID = await donationHelpers.createKID(15, donorId);
      await DAO.distributions.add(
        split,
        KID,
        donorId,
        taxUnitId,
        standardSplit,
        metaOwnerID
      );
    }

    res.json({
      status: 200,
      content: KID,
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

    let distributions = await DAO.distributions.getAll(
      page,
      limit,
      sort,
      filter
    );

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
    if (!req.params.KID)
      res.status(400).json({ status: 400, content: "No KID provided" });
    let distribution = await DAO.distributions.getSplitByKID(req.params.KID);
    let donor = await DAO.donors.getByKID(req.params.KID);
    return res.json({
      status: 200,
      content: {
        donor,
        distribution,
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
});

router.get("/:KID/unauthorized", async (req, res, next) => {
  try {
    const response = await DAO.distributions.getSplitByKID(req.params.KID);

    res.json(response);
  } catch (ex) {
    next({ ex });
  }
});

router.get(
  "/all/:donorID",
  authMiddleware.isAdmin,
  (req, res, next) => {
    authMiddleware.checkDonor(parseInt(req.params.donorID), req, res, next);
  },
  async (req, res, next) => {
    try {
      if (!req.params.donorID)
        res.status(400).json({ status: 400, content: "No KID provided" });
      let distributions = await DAO.distributions.getAllByDonor(
        req.params.donorID
      );
      return res.json({
        status: 200,
        content: distributions,
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
  }
);

module.exports = router;
