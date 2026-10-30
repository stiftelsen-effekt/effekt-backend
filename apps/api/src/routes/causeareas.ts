import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import {
  buildNewCauseArea,
  getAllCauseAreasWithOrganizations,
  mergeCauseAreaUpdate,
  toggleCauseAreaActive,
} from "../custom_modules/configService";

import express from "express";
export const causeAreasRouter = express.Router();

causeAreasRouter.get("/active", async (req, res, next) => {
  try {
    var activeCauseAreas = await DAO.causeareas.getActiveWithOrganizations();

    res.json({
      status: 200,
      content: activeCauseAreas,
    });
  } catch (ex) {
    next(ex);
  }
});

causeAreasRouter.get("/all", async (req, res, next) => {
  try {
    const causeAreasWithOrganizations = await getAllCauseAreasWithOrganizations();

    res.json({
      status: 200,
      content: causeAreasWithOrganizations,
    });
  } catch (ex) {
    next(ex);
  }
});

causeAreasRouter.get("/:id", async (req, res, next) => {
  try {
    const causeArea = await DAO.causeareas.getById(parseInt(req.params.id));
    if (causeArea) {
      res.json({
        status: 200,
        content: causeArea,
      });
    } else {
      res.json({
        status: 404,
        content: "Cause area not found with id " + req.params.id,
      });
    }
  } catch (ex) {
    next(ex);
  }
});

causeAreasRouter.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const {
      name,
      shortDescription,
      longDescription,
      informationUrl,
      ordering,
      standardPercentageShare,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 400,
        content: "Name is required",
      });
    }

    const newCauseArea = buildNewCauseArea({
      name,
      shortDescription,
      longDescription,
      informationUrl,
      ordering,
      standardPercentageShare,
    });

    await DAO.causeareas.add(newCauseArea);

    res.json({
      status: 200,
      content: "Cause area created successfully",
    });
  } catch (ex) {
    next(ex);
  }
});

causeAreasRouter.put("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name,
      shortDescription,
      longDescription,
      informationUrl,
      isActive,
      ordering,
      standardPercentageShare,
    } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const existingCauseArea = await DAO.causeareas.getById(id);
    if (!existingCauseArea) {
      return res.status(404).json({
        status: 404,
        content: "Cause area not found",
      });
    }

    const updatedCauseArea = mergeCauseAreaUpdate(id, existingCauseArea, {
      name,
      shortDescription,
      longDescription,
      informationUrl,
      isActive,
      ordering,
      standardPercentageShare,
    });

    await DAO.causeareas.updateById(updatedCauseArea);

    const updated = await DAO.causeareas.getById(id);
    res.json({
      status: 200,
      content: updated,
    });
  } catch (ex) {
    next(ex);
  }
});

causeAreasRouter.put("/:id/toggle-active", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const existingCauseArea = await DAO.causeareas.getById(id);
    if (!existingCauseArea) {
      return res.status(404).json({
        status: 404,
        content: "Cause area not found",
      });
    }

    const updatedCauseArea = toggleCauseAreaActive(existingCauseArea);

    await DAO.causeareas.updateById(updatedCauseArea);

    const updated = await DAO.causeareas.getById(id);
    res.json({
      status: 200,
      content: updated,
    });
  } catch (ex) {
    next(ex);
  }
});
