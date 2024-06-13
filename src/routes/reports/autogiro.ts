import { processAutogiroInputFile } from "../../custom_modules/autogiro";
import { AutoGiroContent } from "../../custom_modules/parsers/autogiro";
import chardet from "chardet";

module.exports = async (req, res, next) => {
  const encoding = chardet.detect(req.files.report.data);
  var data = req.files.report.data.toString(encoding);

  try {
    const result = await processAutogiroInputFile(data);

    if (result.openingRecord.fileContents === AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP) {
      if (!("results" in result)) throw new Error("Missing results in return object");

      res.json({
        status: 200,
        content: result.results,
      });
    } else if (result.openingRecord.fileContents === AutoGiroContent.E_MANDATES) {
      if (!("emandates" in result)) throw new Error("Missing mandates in e-mandates file");

      res.json({
        status: 200,
        content: {
          newMandates: result.emandates.length,
          invalid: 0,
        },
      });
    } else if (result.openingRecord.fileContents === AutoGiroContent.REJECTED_CHARGES) {
      if (!("results" in result)) throw new Error("Missing results in return object");

      res.json({
        status: 200,
        content: result.results,
      });
    } else if (result.openingRecord.fileContents === AutoGiroContent.MANDATES) {
      if (!("results" in result)) throw new Error("Missing results in return object");

      res.json({
        status: 200,
        content: result.results,
      });
    } else {
      /**
       * TODO: Handle other file types
       */
      res.json({
        status: 200,
        content: {
          valid: 0,
          invalid: 0,
        },
      });
    }
  } catch (ex) {
    return next({ ex: ex });
  }
};
