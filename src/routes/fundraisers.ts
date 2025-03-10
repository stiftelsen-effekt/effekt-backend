import { Router } from "express";
import { DAO } from "../custom_modules/DAO";

export const fundraisersRouter = Router();

fundraisersRouter.get("/list", async (req, res, next) => {
  try {
    const fundraisers = await DAO.fundraisers.getList();
    return res.json({
      status: 200,
      content: fundraisers,
    });
  } catch (ex) {
    next(ex);
  }
});

fundraisersRouter.get("/:id", async (req, res, next) => {
  if (!req.params.id) {
    res.status(400).json({ error: "No ID provided" });
    return;
  }
  if (isNaN(parseInt(req.params.id))) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const fundraiserId = parseInt(req.params.id);

  try {
    const fundraiser = await DAO.fundraisers.getFundraiserByID(fundraiserId);
    if (fundraiser) {
      return res.json({
        status: 200,
        content: fundraiser,
      });
    } else {
      return res.status(404).json({
        status: 404,
        content: "Fundraiser not found",
      });
    }
  } catch (ex) {
    next(ex);
  }
});
