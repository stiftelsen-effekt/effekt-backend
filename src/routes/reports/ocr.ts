const OCRparser = require("../../custom_modules/parsers/OCR.js");
const ocr = require("../../custom_modules/ocr");

module.exports = async (req, res, next) => {
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  var data = req.files.report.data.toString("UTF-8");

  try {
    var transactions = OCRparser.parse(data);
  } catch (ex) {
    return next(ex);
  }

  const result = await ocr.addDonations(transactions, metaOwnerID);

  res.json({
    status: 200,
    content: {
      valid: result.valid,
      //Not used
      invalid: result.invalid,
      invalidTransactions: result.invalidTransactions,
    },
  });
};
