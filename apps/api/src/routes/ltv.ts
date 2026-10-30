import { Router } from "express";
import { getRecentLtvEstimates } from "../custom_modules/ltv";

export const ltvRouter = Router();

ltvRouter.get("/recentestimate", async (req, res, next) => {
  try {
    const estimates = await getRecentLtvEstimates();

    if (!estimates) {
      res.status(404).send("No LTV estimate found");
      return;
    }

    res.json({
      status: 200,
      content: estimates,
    });
  } catch (error) {
    next(error);
  }
});
