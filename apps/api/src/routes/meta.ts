import { DAO } from "../custom_modules/DAO";

import express from "express";
const router = express.Router();

router.get("/owners", async (req, res, next) => {
  try {
    var owners = await DAO.meta.getDataOwners();

    res.json({
      status: 200,
      content: owners,
    });
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
