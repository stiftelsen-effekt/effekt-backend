import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";

import express from "express";
export const causeAreasRouter = express.Router();

/**
 * @openapi
 * /causeareas/active:
 *    get:
 *      tags: [CauseAreas]
 *      description: Fetches all active cause areas and their organizations
 *      responses:
 *        200:
 *          description: Cause area with active organizations
 *          content:
 *             application/json:
 *               schema:
 *                 allOf:
 *                   - $ref: '#/components/schemas/ApiResponse'
 *                   - type: object
 *                     properties:
 *                        content:
 *                           type: array
 *                           items:
 *                              allOf:
 *                                - $ref: '#/components/schemas/CauseArea'
 *                                - type: object
 *                                  properties:
 *                                    organizations:
 *                                      type: array
 *                                      items:
 *                                        $ref: '#/components/schemas/Organization'
 *                     example:
 *                        content:
 *                           - allOf:
 *                             - $ref: '#/components/schemas/CauseArea/example'
 *                             - organizations:
 *                               - $ref: '#/components/schemas/Organization/example'
 */
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
    const causeAreas = await DAO.causeareas.getAll();
    const organizations = await DAO.organizations.getAll();

    const causeAreasWithOrganizations = [];
    for (let causeArea of causeAreas) {
      causeAreasWithOrganizations.push({
        ...causeArea,
        organizations: organizations.filter((org) => org.causeAreaId === causeArea.id),
      });
    }

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

    const newCauseArea = {
      name,
      shortDescription: shortDescription || "",
      longDescription: longDescription || "",
      informationUrl: informationUrl || "",
      isActive: true,
      ordering: ordering || 99,
      standardPercentageShare: standardPercentageShare || 0,
    };

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

    const updatedCauseArea = {
      id,
      name: name !== undefined ? name : existingCauseArea.name,
      shortDescription:
        shortDescription !== undefined ? shortDescription : existingCauseArea.shortDescription,
      longDescription:
        longDescription !== undefined ? longDescription : existingCauseArea.longDescription,
      informationUrl:
        informationUrl !== undefined ? informationUrl : existingCauseArea.informationUrl,
      isActive: isActive !== undefined ? isActive : existingCauseArea.isActive,
      ordering: ordering !== undefined ? ordering : existingCauseArea.ordering,
      standardPercentageShare:
        standardPercentageShare !== undefined
          ? standardPercentageShare
          : existingCauseArea.standardPercentageShare,
    };

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

    const updatedCauseArea = {
      ...existingCauseArea,
      isActive: !existingCauseArea.isActive,
    };

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
