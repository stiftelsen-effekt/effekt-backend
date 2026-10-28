import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { buildOverview } from "../custom_modules/DAO_modules/analysis";
import { PledgeInput } from "../custom_modules/DAO_modules/pledges";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

export const analysisRouter = Router();

/**
 * @openapi
 * /analysis/overview:
 *   get:
 *    tags: [Analysis]
 *    description: Totals for the analysis overview in the admin panel. Collected this year,
 *      through time and open pledges, with pledges kept as a separate layer.
 */
analysisRouter.get("/overview", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const totals = await DAO.analysis.getOverviewTotals();

    res.json({
      status: 200,
      content: buildOverview(totals),
    });
  } catch (ex) {
    next(ex);
  }
});

const isDateString = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));

/**
 * Validates a pledge from the request body. Returns an error message, or the input.
 * A pledge holds only the amount and dates, so any other field is ignored.
 */
export const parsePledgeInput = (body: any): PledgeInput | string => {
  const sum = Number(body?.sum);
  if (!Number.isFinite(sum) || sum <= 0) return "sum must be a positive number";
  if (Math.round(sum * 100) / 100 !== sum) return "sum can have at most two decimals";
  if (!isDateString(body?.decidedDate)) return "decidedDate must be a date (YYYY-MM-DD)";

  const receivedDate = body?.receivedDate ?? null;
  if (receivedDate !== null && !isDateString(receivedDate))
    return "receivedDate must be a date (YYYY-MM-DD) or null";

  const donationId = body?.donationId ?? null;
  if (donationId !== null && !(Number.isInteger(donationId) && donationId > 0))
    return "donationId must be a donation ID or null";
  if (donationId !== null && receivedDate === null)
    return "donationId can only be set on a received pledge";

  return { sum, decidedDate: body.decidedDate, receivedDate, donationId };
};

/**
 * @openapi
 * /analysis/pledges:
 *   get:
 *    tags: [Analysis]
 *    description: All pledges (tilsagn), open first. Only amounts and dates, never who pledged.
 */
analysisRouter.get("/pledges", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    res.json({ status: 200, content: await DAO.pledges.getAll() });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /analysis/pledges:
 *   post:
 *    tags: [Analysis]
 *    description: Adds a pledge (tilsagn) with sum and decidedDate
 */
analysisRouter.post("/pledges", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const input = parsePledgeInput(req.body);
    if (typeof input === "string") return res.status(400).json({ status: 400, content: input });
    if (input.donationId !== null && !(await DAO.pledges.donationExists(input.donationId)))
      return res.status(400).json({ status: 400, content: "donation not found" });

    const id = await DAO.pledges.add(input);
    res.json({ status: 200, content: await DAO.pledges.getById(id) });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /analysis/pledges/{id}:
 *   put:
 *    tags: [Analysis]
 *    description: Updates a pledge. Set receivedDate (and optionally donationId) when the money
 *      has come in, or lower the sum to what remains after a partial payment.
 */
analysisRouter.put("/pledges/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ status: 400, content: "invalid id" });

    const input = parsePledgeInput(req.body);
    if (typeof input === "string") return res.status(400).json({ status: 400, content: input });
    if (input.donationId !== null && !(await DAO.pledges.donationExists(input.donationId)))
      return res.status(400).json({ status: 400, content: "donation not found" });

    if (!(await DAO.pledges.update(id, input)))
      return res.status(404).json({ status: 404, content: "pledge not found" });
    res.json({ status: 200, content: await DAO.pledges.getById(id) });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /analysis/pledges/{id}:
 *   delete:
 *    tags: [Analysis]
 *    description: Deletes a pledge that fell through
 */
analysisRouter.delete("/pledges/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ status: 400, content: "invalid id" });

    if (!(await DAO.pledges.remove(id)))
      return res.status(404).json({ status: 404, content: "pledge not found" });
    res.json({ status: 200, content: id });
  } catch (ex) {
    next(ex);
  }
});
