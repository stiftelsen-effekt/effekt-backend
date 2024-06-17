import { processAutogiroInputFile } from "../../custom_modules/autogiro";
import { AutoGiroContent } from "../../custom_modules/parsers/autogiro";
import chardet from "chardet";

module.exports = async (req, res, next) => {
  const encoding = chardet.detect(req.files.report.data);
  var data = req.files.report.data.toString(getNodeEncoding(encoding));

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

const encodingMap = {
  "UTF-8": "utf8",
  "UTF-16 LE": "utf16le",
  "UTF-16 BE": "utf16be",
  "UTF-32 LE": "utf32le",
  "UTF-32 BE": "utf32be",
  "ISO-2022-JP": "iso-2022-jp",
  "ISO-2022-KR": "iso-2022-kr",
  "ISO-2022-CN": "iso-2022-cn",
  Shift_JIS: "shift_jis",
  Big5: "big5",
  "EUC-JP": "euc-jp",
  "EUC-KR": "euc-kr",
  GB18030: "gb18030",
  "ISO-8859-1": "latin1",
  "ISO-8859-2": "latin2",
  "ISO-8859-5": "iso-8859-5",
  "ISO-8859-6": "iso-8859-6",
  "ISO-8859-7": "iso-8859-7",
  "ISO-8859-8": "iso-8859-8",
  "ISO-8859-9": "iso-8859-9",
  "windows-1250": "win1250",
  "windows-1251": "win1251",
  "windows-1252": "win1252",
  "windows-1253": "win1253",
  "windows-1254": "win1254",
  "windows-1255": "win1255",
  "windows-1256": "win1256",
  "KOI8-R": "koi8-r",
};

function getNodeEncoding(chardetEncoding) {
  return encodingMap[chardetEncoding] || null;
}
