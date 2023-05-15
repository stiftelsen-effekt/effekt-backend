import { DAO } from "../custom_modules/DAO";

import express from "express";
const router = express.Router();

import bodyParser from "body-parser";
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

router.get("/active", urlEncodeParser, async (req, res, next) => {
  try {
    var activeOrganizations = await DAO.organizations.getActive();

    res.json({
      status: 200,
      content: activeOrganizations,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/all", async (req, res, next) => {
  try {
    const organizations = await DAO.organizations.getAll();

    res.json({
      status: 200,
      content: organizations,
    });
  } catch (ex) {
    next(ex);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const org = await DAO.organizations.getByID(req.params.id);

    if (org) {
      res.json({
        status: 200,
        content: org,
      });
    } else {
      res.json({
        status: 404,
        content: "Organization not found with id " + req.params.id,
      });
    }
  } catch (ex) {
    next(ex);
  }
});

/* 
  TODO: POST to '/' - Create Organization, for admin panel
*/

module.exports = router;
