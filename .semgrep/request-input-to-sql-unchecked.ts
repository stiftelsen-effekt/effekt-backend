import express from "express";
import { DAO } from "../custom_modules/DAO";
import { sendDonationRegistered } from "../custom_modules/mail";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

const router = express.Router();

router.post("/unchecked", async (req, res) => {
  const parsedData = req.body;
  // ruleid: request-input-to-sql-without-type-check
  await DAO.referrals.checkRecordExist(parsedData.referralID, parsedData.donorID);
  // ruleid: request-input-to-sql-without-type-check
  await DAO.query("SELECT * FROM Donors WHERE email = ?", [req.body.email]);
  // ruleid: request-input-to-sql-without-type-check
  await DAO.donors.search(req.query.q);
});

router.post("/only-presence-checked", async (req, res) => {
  const data = req.body;
  if (typeof data.KID === "undefined") throw new Error("Missing KID");
  // ruleid: request-input-to-sql-without-type-check
  await DAO.donations.getByKID(data.KID);
});

router.post("/json-body", async (req, res) => {
  const parsedData = JSON.parse(req.body.data);
  if (!parsedData || !parsedData.KID) return res.sendStatus(400);
  // ruleid: request-input-to-sql-without-type-check
  await sendDonationRegistered(parsedData.KID, parsedData.sum);
});

router.post("/converted", async (req, res) => {
  const donorId = parseInt(req.body.donorID);
  const sum = Number(req.body.sum);
  // ok: request-input-to-sql-without-type-check
  await DAO.donations.add(donorId, sum, String(req.body.KID));
});

router.post("/guarded", async (req, res) => {
  const parsedData = req.body;
  if (!Number.isInteger(parsedData.donorID) || typeof parsedData.session !== "string") {
    return res.sendStatus(400);
  }
  // ok: request-input-to-sql-without-type-check
  await DAO.referrals.checkRecordExist(parsedData.donorID, parsedData.session);
});

router.post("/regex-guarded", async (req, res) => {
  const KID = req.body.KID;
  if (typeof KID !== "string" || !/^\d+$/.test(KID)) return res.sendStatus(400);
  // ok: request-input-to-sql-without-type-check
  await DAO.donations.getByKID(KID);
});

router.get("/params", async (req, res) => {
  // ok: request-input-to-sql-without-type-check
  await DAO.donors.getByID(req.params.id);
});

export default router;

router.post("/admin-only", authMiddleware.isAdmin, async (req, res) => {
  // ok: request-input-to-sql-without-type-check
  await DAO.donors.search(req.body.q);
});

router.post("/db-result", async (req, res) => {
  // ruleid: request-input-to-sql-without-type-check
  const donorID = await DAO.donors.getIDbyEmail(req.body.email);
  // ok: request-input-to-sql-without-type-check
  await DAO.donors.getByID(donorID);
});
