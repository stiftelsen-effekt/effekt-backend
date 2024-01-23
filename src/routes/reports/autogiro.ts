import { processAutogiroInputFile } from "../../custom_modules/autogiro";
import { AutoGiroContent } from "../../custom_modules/parsers/autogiro";

module.exports = async (req, res, next) => {
  let metaOwnerID = parseInt(req.body.metaOwnerID);

  var data = req.files.report.data.toString("latin1");

  const result = await processAutogiroInputFile(data);

  if (result.openingRecord.fileContents === AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP) {
    if (!("deposits" in result)) throw new Error("Missing deposits in payment specifications file");

    console.log(result.deposits);
    console.log(result.refunds);
    console.log(result.withdrawals);

    res.json({
      status: 200,
      content: {
        valid: result.deposits.length,
        invalid: 0,
      },
    });
  } else if (result.openingRecord.fileContents === AutoGiroContent.E_MANDATES) {
    if (!("emandates" in result)) throw new Error("Missing mandates in e-mandates file");

    console.log(result.emandates);

    res.json({
      status: 200,
      content: {
        newMandates: result.emandates.length,
        invalid: 0,
      },
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
};
