import { sendTaxDeductions } from "../../custom_modules/mail";

const taxDeductionParser = require("../../custom_modules/parsers/tax.js");

module.exports = async (req, res, next) => {
  try {
    if (!req.files || !req.files.report) return res.sendStatus(400);
    if (!req.body.year) return res.sendStatus(400);

    let year = parseInt(req.body.year);

    if (year < 2016 || year > 3000) return res.sendStatus(400);

    let records = taxDeductionParser.parseReport(req.files.report.data);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      let result = await sendTaxDeductions(record, year);
      if (result === true) success++;
      else failed++;
    }

    res.json({
      status: 200,
      content: `Sent ${success} mails, ${failed} failed`,
    });
  } catch (ex) {
    next({ ex });
  }
};
