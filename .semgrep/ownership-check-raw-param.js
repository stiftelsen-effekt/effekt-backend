// A router that validates :id up front with router.param is not flagged:
// requireIntegerParam rejects anything that is not a plain integer, so the raw
// and the parsed value cannot disagree.
const express = require("express");
const { DAO } = require("../custom_modules/DAO");
const { checkAdminOrTheDonor, requireIntegerParam } = require("./middleware");

const router = express.Router();
router.param("id", requireIntegerParam);

router.get(
  "/:id/donations",
  (req, res, next) => checkAdminOrTheDonor(parseInt(req.params.id), req, res, next),
  async (req, res, next) => {
    // ok: ownership-check-on-parsed-param-raw-param-used
    res.json(await DAO.donations.getByDonorId(req.params.id));
  },
);

router.get(
  "/:donorID/agreements",
  (req, res, next) => checkAdminOrTheDonor(parseInt(req.params.donorID), req, res, next),
  async (req, res, next) => {
    // ruleid: ownership-check-on-parsed-param-raw-param-used
    res.json(await DAO.agreements.getByDonor(req.params.donorID));
  },
);

module.exports = router;
