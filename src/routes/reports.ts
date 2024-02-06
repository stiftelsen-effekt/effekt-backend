import { isAdmin } from "../custom_modules/authorization/authMiddleware";

import express from "express";
const router = express.Router();

import bodyParser from "body-parser";
import { adoveoReportRouter } from "./reports/adoveo";
import { bankReportRouter } from "./reports/bank";
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

router.post("/ocr", isAdmin, require("./reports/ocr"));
router.use("/bank", bankReportRouter);
router.post("/vipps", isAdmin, require("./reports/vipps"));
router.post("/facebook", isAdmin, require("./reports/facebook"));
router.post("/paypal", isAdmin, require("./reports/paypal"));
router.post("/range", urlEncodeParser, isAdmin, require("./reports/range"));
router.post("/taxdeductions", urlEncodeParser, isAdmin, require("./reports/tax"));
router.post("/autogiro", isAdmin, require("./reports/autogiro"));
router.use("/adoveo", adoveoReportRouter);

module.exports = router;
