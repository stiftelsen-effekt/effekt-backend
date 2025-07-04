import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

import express from "express";
const router = express.Router();

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

router.get("/types/all", async (req, res, next) => {
  try {
    let types = await DAO.referrals.getAllTypes();
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

// Admin endpoints for managing referral types
router.post("/types", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const { name, ordering } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 400,
        content: "Name is required",
      });
    }

    if (ordering === undefined || ordering === null) {
      return res.status(400).json({
        status: 400,
        content: "Ordering is required",
      });
    }

    const newType = await DAO.referrals.createType(name, ordering);

    res.json({
      status: 200,
      content: newType,
    });
  } catch (ex) {
    next(ex);
  }
});

router.put("/types/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, ordering, is_active } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (ordering !== undefined) updateData.ordering = ordering;
    if (is_active !== undefined) updateData.is_active = is_active;

    const success = await DAO.referrals.updateType(id, updateData);

    if (success) {
      const updatedType = await DAO.referrals.getTypeById(id);
      res.json({
        status: 200,
        content: updatedType,
      });
    } else {
      res.status(404).json({
        status: 404,
        content: "Referral type not found or no changes made",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.put("/types/:id/toggle-active", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const success = await DAO.referrals.toggleTypeActive(id);

    if (success) {
      const updatedType = await DAO.referrals.getTypeById(id);
      res.json({
        status: 200,
        content: updatedType,
      });
    } else {
      res.status(404).json({
        status: 404,
        content: "Referral type not found",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
