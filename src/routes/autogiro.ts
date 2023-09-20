import * as express from "express";
import { AutoGiroParser } from "../custom_modules/parsers/autogiro";
import { processAutogiroInputFile } from "../custom_modules/autogiro";

const router = express.Router();

router.post("/reports/process", async (req, res) => {
  const report = req.files.report;
  if (Array.isArray(report)) {
    throw new Error("Expected a single file");
  }
  const data = report.data.toString("latin1");

  const result = await processAutogiroInputFile(data);

  res.json(result);
});

module.exports = router;
