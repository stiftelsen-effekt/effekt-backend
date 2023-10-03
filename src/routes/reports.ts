import { isAdmin } from "../custom_modules/authorization/authMiddleware";

import express from "express";
const router = express.Router();

import bodyParser from "body-parser";
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

router.post("/ocr", isAdmin, require("./reports/ocr"));
router.post("/bank", isAdmin, require("./reports/bank"));
router.post("/vipps", isAdmin, require("./reports/vipps"));
router.post("/facebook", isAdmin, require("./reports/facebook"));
router.post("/paypal", isAdmin, require("./reports/paypal"));
router.post("/range", urlEncodeParser, isAdmin, require("./reports/range"));
router.post("/taxdeductions", urlEncodeParser, isAdmin, require("./reports/tax"));
router.post("/autogiro", isAdmin, require("./reports/autogiro"));

module.exports = router;
