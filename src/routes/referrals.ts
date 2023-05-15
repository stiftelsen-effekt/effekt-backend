import { DAO } from "../custom_modules/DAO";

import express from "express";
const router = express.Router();
import bodyParser from "body-parser";
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

router.get("/types", async (req, res, next) => {
  try {
    let types = await DAO.referrals.getTypes();

    res.json({
      status: 200,
      content: types,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/aggregate", async (req, res, next) => {
  try {
    let aggregate = await DAO.referrals.getAggregate();

    res.json({
      status: 200,
      content: aggregate,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/", async (req, res, next) => {
  try {
    let parsedData = req.body;
    if (typeof parsedData.referralID === "undefined")
      throw new Error("Missing parameter referralID");
    if (typeof parsedData.donorID === "undefined") throw new Error("Missing parameter donorID");
    if (typeof parsedData.active === "undefined") throw new Error("Missing parameter active");
    if (typeof parsedData.session === "undefined") throw new Error("Missing parameter session");

    if (typeof parsedData.comment === "undefined") parsedData.comment = null;

    const OTHER_REFERRAL_ID = 10;

    if (parsedData.active) {
      const otherRecordExists = await DAO.referrals.checkRecordExist(
        parsedData.referralID,
        parsedData.donorID,
        parsedData.session,
      );

      if (otherRecordExists) {
        /**
         * If the record is already in the database, we only need to update the comment
         * as there can be only one record of a certain referral type per donor and session.
         */
        if (parsedData.referralID === OTHER_REFERRAL_ID) {
          const updated = await DAO.referrals.updateRecordComment(
            parsedData.referralID,
            parsedData.donorID,
            parsedData.session,
            parsedData.comment,
          );
          if (updated) {
            res.json({
              status: 200,
            });
          } else {
            throw new Error("Failed to update existing referral record with new comment.");
          }
        }
      } else {
        let status = await DAO.referrals.addRecord(
          parsedData.referralID,
          parsedData.donorID,
          parsedData.session,
          parsedData.comment,
        );

        if (!status) throw new Error("Failed to add record");
        res.json({
          status: 200,
          content: status,
        });
      }
    } else {
      let status = await DAO.referrals.deleteRecord(
        parsedData.referralID,
        parsedData.donorID,
        parsedData.session,
      );
      if (!status) throw new Error("Failure to delete record");
      res.json({
        status: 200,
        content: status,
      });
    }
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
