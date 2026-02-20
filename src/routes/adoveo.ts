import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

export const adoveoRouter = Router();

/**
 * Paginated list of Adoveo fundraisers with filters & sorting
 */
adoveoRouter.post("/list", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const result = await DAO.adoveo.getList(
      req.body.pagination.page,
      req.body.pagination.limit,
      req.body.filter,
      req.body.pagination.sort,
    );
    return res.json({
      status: 200,
      content: result,
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * Get single Adoveo fundraiser by ID (with org shares & donation stats)
 */
adoveoRouter.get("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  if (!req.params.id || isNaN(parseInt(req.params.id))) {
    return res.status(400).json({ status: 400, content: "Invalid ID" });
  }
  const id = parseInt(req.params.id);

  try {
    const fundraiser = await DAO.adoveo.getAdoveoByID(id);
    if (fundraiser) {
      return res.json({ status: 200, content: fundraiser });
    } else {
      return res.status(404).json({ status: 404, content: "Adoveo fundraiser not found" });
    }
  } catch (ex) {
    next(ex);
  }
});

/**
 * Create new Adoveo fundraiser
 */
adoveoRouter.post("/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const { name, donorId, adoveoId, orgShares, useStandardSplit } = req.body;

    if (!name) {
      return res.status(400).json({ status: 400, content: "Name is required" });
    }

    const fundraiserId = await DAO.adoveo.createFundraiser(name, donorId, adoveoId);

    if (useStandardSplit) {
      const causeAreas = await DAO.causeareas.getActiveWithOrganizations();
      const shares: { orgId: number; share: number; standardSplit: boolean }[] = [];

      for (const causeArea of causeAreas) {
        const causeAreaShare = causeArea.standardPercentageShare || 0;
        for (const org of causeArea.organizations) {
          const orgShare = (org.standardShare || 0) * causeAreaShare;
          if (orgShare > 0) {
            shares.push({
              orgId: org.id,
              share: orgShare,
              standardSplit: true,
            });
          }
        }
      }

      if (shares.length > 0) {
        await DAO.adoveo.addFundraiserOrgShares(fundraiserId, shares);
      }
    } else if (orgShares && Array.isArray(orgShares) && orgShares.length > 0) {
      await DAO.adoveo.addFundraiserOrgShares(
        fundraiserId,
        orgShares.map((s: any) => ({
          orgId: s.orgId,
          share: s.share,
          standardSplit: s.standardSplit ?? false,
        })),
      );
    }

    const created = await DAO.adoveo.getAdoveoByID(fundraiserId);
    return res.json({ status: 200, content: created });
  } catch (ex) {
    next(ex);
  }
});
