import express from "express";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { checkAdminOrTheDonor } from "../custom_modules/authorization/authMiddleware";

const router = express.Router();

router.get(
  "/:id/donations",
  authMiddleware.auth("read"),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    // ruleid: ownership-check-on-parsed-param-raw-param-used
    const donations = await DAO.donations.getByDonorId(req.params.id);
    res.json(donations);
  },
);

router.get(
  "/:donorID/summary",
  (req, res, next) => {
    authMiddleware.checkAdminOrTheDonor(parseInt(req.params.donorID), req, res, next);
  },
  async (req, res, next) => {
    // ruleid: ownership-check-on-parsed-param-raw-param-used
    res.json(await DAO.donors.getSummary(req.params.donorID, 2026));
  },
);

router.get(
  "/:id/parsed",
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    // ok: ownership-check-on-parsed-param-raw-param-used
    const donorId = parseInt(req.params.id);
    // ok: ownership-check-on-parsed-param-raw-param-used
    const other = Number(req.params.id);
    res.json(await DAO.donations.getByDonorId(donorId));
  },
);

router.get("/:id/no-check", async (req, res, next) => {
  // ok: ownership-check-on-parsed-param-raw-param-used
  res.json(await DAO.public.getThing(req.params.id));
});

export default router;
