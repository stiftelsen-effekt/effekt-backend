import { DAO } from "../custom_modules/DAO";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { donationHelpers } from "../custom_modules/donationHelpers";

import express from "express";
const router = express.Router();

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
router.get("/active", async (req, res, next) => {
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

module.exports = router;
