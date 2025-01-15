import { Router } from "express";
import { DAO } from "../custom_modules/DAO";

export const fundraisersRouter = Router();

fundraisersRouter.get("/donationsums", async (req, res) => {
  const idsQuery = req.query.ids;

  if (typeof idsQuery !== "string") {
    return res.status(400).json({
      status: 400,
      content: "ids query parameter must be a comma separated list of integers",
    });
  }

  const ids = idsQuery.split(",").map((id) => parseInt(id));

  if (ids.some((id) => isNaN(id))) {
    return res.status(400).json({
      status: 400,
      content: "ids query parameter must be a comma separated list of integers",
    });
  }

  const donationSums = await DAO.adoveo.getFundraiserDonationSumsByIDs(ids);

  return res.json({
    status: 200,
    content: donationSums,
  });
});

fundraisersRouter.get("/:id/vippsnumber", async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({
      status: 400,
      content: "id must be an integer",
    });
  }

  const vippsNumberSum = await DAO.adoveo.getFundraiserVippsNumberLocationSum(id);

  return res.json({
    status: 200,
    content: vippsNumberSum,
  });
});
