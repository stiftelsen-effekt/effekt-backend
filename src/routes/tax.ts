import { DAO } from "../custom_modules/DAO";

const express = require("express");
const router = express.Router();

// A route that updates a tax unit name and ssn
/**
 * @openapi
 * /tax/{id}:
 *   put:
 *    tags: [Tax]
 *    description: Updates a tax unit
 *    security:
 *       - auth0_jwt: [write:profile]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to update.
 *        schema:
 *          type: integer
 *      - in: body
 *        name: taxUnit
 *        required: true
 *        description: The tax unit to update
 *        schema:
 *          $ref: '#/components/schemas/TaxUnit'
 *    responses:
 *      200:
 *        description: Tax unit was updated
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: string
 *                   example:
 *                      content: OK
 *      401:
 *        description: User not authorized to access resource
 *      404:
 *        description: Tax unit with given id not found
 */
router.put("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const taxUnit = req.body.taxUnit;

    if (!id || !taxUnit) {
      res.status(400).json({
        status: 400,
        content: "Missing parameters id or taxUnit",
      });
      return;
    }

    if (!taxUnit.name || !taxUnit.ssn) {
      res.status(400).json({
        status: 400,
        content: "Missing parameters name or ssn on tax unit",
      });
      return;
    }

    const changed = await DAO.tax.updateTaxUnit(id, taxUnit);
    if (changed) {
      res.json({
        status: 200,
        content: "OK",
      });
    } else {
      res.json({
        status: 404,
        content: "Not found",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

router.put(
  "/donations/assign",
  //authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      const singleTaxUnits = await DAO.donors.getIDsWithOneTaxUnit()

      for (let i = 0; i < singleTaxUnits.length; i++) {
        await DAO.tax.updateKIDsMissingTaxUnit(singleTaxUnits[i]["ID"], singleTaxUnits[i]["Donor_ID"])
      }

      return res.json({status: 200});
    } catch (ex) {
      next(ex);
    }
  }
);

module.exports = router;
