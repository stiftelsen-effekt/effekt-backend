import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

import express from "express";
export const organizationsRouter = express.Router();

import bodyParser from "body-parser";
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

organizationsRouter.get("/active", urlEncodeParser, async (req, res, next) => {
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

organizationsRouter.get("/all", async (req, res, next) => {
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

organizationsRouter.get("/:id", async (req, res, next) => {
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

organizationsRouter.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const {
      name,
      abbreviation,
      shortDescription,
      longDescription,
      informationUrl,
      ordering,
      standardShare,
      causeAreaId,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 400,
        content: "Name is required",
      });
    }

    if (!abbreviation) {
      return res.status(400).json({
        status: 400,
        content: "Abbreviation is required",
      });
    }

    if (!causeAreaId) {
      return res.status(400).json({
        status: 400,
        content: "Cause area ID is required",
      });
    }

    const newOrganization = {
      name,
      abbreviation,
      shortDescription: shortDescription || "",
      longDescription: longDescription || "",
      informationUrl: informationUrl || "",
      isActive: true,
      ordering: ordering || 99,
      standardShare: standardShare || 0,
      causeAreaId,
    };

    await DAO.organizations.add(newOrganization);

    res.json({
      status: 200,
      content: "Organization created successfully",
    });
  } catch (ex) {
    next(ex);
  }
});

organizationsRouter.put("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name,
      abbreviation,
      shortDescription,
      longDescription,
      informationUrl,
      isActive,
      ordering,
      standardShare,
      causeAreaId,
    } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const existingOrganization = await DAO.organizations.getByID(id);
    if (!existingOrganization) {
      return res.status(404).json({
        status: 404,
        content: "Organization not found",
      });
    }

    const updatedOrganization = {
      id,
      name: name !== undefined ? name : existingOrganization.full_name,
      abbreviation: abbreviation !== undefined ? abbreviation : existingOrganization.abbriv,
      shortDescription:
        shortDescription !== undefined ? shortDescription : existingOrganization.short_desc,
      longDescription:
        longDescription !== undefined ? longDescription : existingOrganization.long_desc,
      informationUrl: informationUrl !== undefined ? informationUrl : existingOrganization.info_url,
      isActive: isActive !== undefined ? isActive : existingOrganization.is_active === 1,
      ordering: ordering !== undefined ? ordering : existingOrganization.ordering,
      standardShare:
        standardShare !== undefined ? standardShare : existingOrganization.std_percentage_share,
      causeAreaId: causeAreaId !== undefined ? causeAreaId : existingOrganization.cause_area_ID,
    };

    await DAO.organizations.updateById(updatedOrganization);

    const updated = await DAO.organizations.getByID(id);
    res.json({
      status: 200,
      content: updated,
    });
  } catch (ex) {
    next(ex);
  }
});

organizationsRouter.put("/:id/toggle-active", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid ID",
      });
    }

    const existingOrganization = await DAO.organizations.getByID(id);
    if (!existingOrganization) {
      return res.status(404).json({
        status: 404,
        content: "Organization not found",
      });
    }

    const updatedOrganization = {
      id,
      name: existingOrganization.full_name,
      abbreviation: existingOrganization.abbriv,
      shortDescription: existingOrganization.short_desc,
      longDescription: existingOrganization.long_desc,
      informationUrl: existingOrganization.info_url,
      isActive: !(existingOrganization.is_active === 1),
      ordering: existingOrganization.ordering,
      standardShare: existingOrganization.std_percentage_share,
      causeAreaId: existingOrganization.cause_area_ID,
    };

    await DAO.organizations.updateById(updatedOrganization);

    const updated = await DAO.organizations.getByID(id);
    res.json({
      status: 200,
      content: updated,
    });
  } catch (ex) {
    next(ex);
  }
});
