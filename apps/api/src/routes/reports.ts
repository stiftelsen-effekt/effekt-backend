import { isAdmin } from "../custom_modules/authorization/authMiddleware";

import express from "express";
const router = express.Router();

import bodyParser from "body-parser";
import { bankReportRouter } from "./reports/bank";
import { amfReportRouter } from "./reports/amf";
import { donationsByOrgRouter } from "./reports/donationsbyorg";
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

router.post("/ocr", isAdmin, require("./reports/ocr"));
router.use("/bank", bankReportRouter);
router.post("/vipps", isAdmin, require("./reports/vipps"));
router.post("/range", urlEncodeParser, isAdmin, require("./reports/range"));
router.post("/taxdeductions", urlEncodeParser, isAdmin, require("./reports/tax"));
router.use("/amf", amfReportRouter);
router.use("/donationsbyorg", donationsByOrgRouter);

module.exports = router;
