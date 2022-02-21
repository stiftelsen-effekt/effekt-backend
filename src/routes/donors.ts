import * as express from "express";
import { checkDonor } from "../custom_modules/authorization/authMiddleware";
const router = express.Router();
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const roles = require("../enums/authorizationRoles");

const DAO = require("../custom_modules/DAO");

const bodyParser = require("body-parser");
const urlEncodeParser = bodyParser.urlencoded({ extended: false });

/**
 * @openapi
 * tags:
 *   - name: Donors
 *     description: Donors in the database
 */

/**
 * @openapi
 * /donors/:
 *   post:
 *    tags: [Donors]
 *    description: Add a new user
 */
router.post("/", urlEncodeParser, async (req, res, next) => {
  try {
    if (!req.body.name) {
      let error = new Error("Missing param email or param name");
      throw error;
    }

    await DAO.donors.add(req.body.email, req.body.name, req.body.ssn);

    return res.json({
      status: 200,
      content: "OK",
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /donors/id/:
 *   get:
 *    tags: [Donors]
 *    description: Get a donor id by email
 *    parameters:
 *      - in: query
 *        name: email
 *        required: true
 *        description: The email of the user to get the id for
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns a donor id
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: number
 *                   example:
 *                      content: 231
 *      404:
 *        description: Donor with given email not found
 */
router.get("/id/", async (req, res, next) => {
  try {
    if (!req.query.email) {
      res.status(400).json({
        status: 400,
        content: "email parameter missing",
      });
    }

    const donorID = await DAO.donors.getIDbyEmail(req.query.email);

    if (donorID === null) {
      res.status(404).json({
        status: 404,
        content: "No donor with the given email found",
      });
    } else {
      res.json({
        status: 200,
        content: donorID,
      });
    }
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /donors/{id}:
 *   get:
 *    tags: [Donors]
 *    description: Get a donor by id
 *    security:
 *       - oAuth: [read_donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns a donor object
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content:
 *                        $ref: '#/components/schemas/Donor'
 *                   example:
 *                      content:
 *                        $ref: '#/components/schemas/Donor/example'
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donor with given id not found
 */
router.get(
  "/:id",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      var donor = await DAO.donors.getByID(req.params.id);

      if (donor) {
        return res.json({
          status: 200,
          content: donor,
        });
      } else {
        return res.status(404).json({
          status: 404,
          content: "No donor found with ID " + req.params.id,
        });
      }
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/{id}:
 *   delete:
 *    tags: [Donors]
 *    description: Get a donor by id
 *    security:
 *       - oAuth: [write_donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to delete.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Donor was deleted
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: boolean
 *                   example:
 *                      content: true
 *      401:
 *        description: User not authorized to access resource
 *      404:
 *        description: Donor with given id not found
 */
router.delete(
  "/:id",
  authMiddleware.auth(roles.write_donations),
  async (req, res, next) => {
    try {
      var donor = await DAO.donors.getByID(req.params.id);

      if (donor) {
        await DAO.donors.deleteById(req.params.id);

        return res.json({
          status: 200,
          content: true,
        });
      } else {
        return res.status(404).json({
          status: 404,
          content: "No donor found with ID " + req.params.id,
        });
      }
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/search:
 *   post:
 *    tags: [Donors]
 *    description: Search for donors in the database
 *    security:
 *       - oAuth: [read_donations]
 *    parameters:
 *      - in: application/json
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns a donor object
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donor with given id not found
 */
router.get(
  "/search/",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      var donors = await DAO.donors.search(req.query.q);

      if (donors) {
        return res.json({
          status: 200,
          content: donors,
        });
      } else {
        return res.status(404).json({
          status: 404,
          content: "No donors found matching query",
        });
      }
    } catch (ex) {
      next(ex);
    }
  }
);

router.get(
  "/:id/donations",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const donations = await DAO.donations.getByDonorId(req.params.id);

      return res.json({
        status: 200,
        content: donations,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

router.get(
  "/:id/distributions",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      const distributions = await DAO.distributions.getByDonorId(req.params.id);

      return res.json({
        status: 200,
        content: distributions,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

router.get(
  "/:id/recurring/avtalegiro",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      const agreements = await DAO.avtalegiroagreements.getByDonorId(
        req.params.id
      );

      return res.json({
        status: 200,
        content: agreements,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

router.get(
  "/:id/recurring/vipps",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      const agreements = await DAO.vipps.getAgreementsByDonorId(req.params.id);

      return res.json({
        status: 200,
        content: agreements,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/{id}/donations/aggregated:
 *   get:
 *    tags: [Donors]
 *    description: Get a donor by id
 *    security:
 *       - oAuth: [read_donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns a donor object
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content:
 *                         type: array
 *                         items:
 *                            $ref: '#/components/schemas/AggregatedDonation'
 *                   example:
 *                      content:
 *                         - $ref: '#/components/schemas/AggregatedDonation/example'
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donor with given id not found
 */
router.get(
  "/:id/donations/aggregated",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const aggregated = await DAO.donations.getYearlyAggregateByDonorId(
        req.params.id
      );

      return res.json({
        status: 200,
        content: aggregated,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/{id}/summary/:
 *   get:
 *    tags: [Donors]
 *    description: Fetches the total amount of money donated to each organization by a specific donor
 */
router.get(
  "/:id/summary/",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      var summary = await DAO.donations.getSummary(req.params.id);

      res.json({
        status: 200,
        content: summary,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/{id}/history/:
 *   get:
 *    tags: [Donors]
 *    description: Fetches donation history for a donor
 */
router.get(
  "/:id/history/",
  authMiddleware.auth(roles.read_donations),
  async (req, res, next) => {
    try {
      var history = await DAO.donations.getHistory(req.params.id);

      res.json({
        status: 200,
        content: history,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/{id}:
 *   put:
 *    tags: [Donors]
 *    description: Updates donor by ID
 *    security:
 *       - oAuth: [write:profile]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to update.
 *        schema:
 *          type: integer
 *      - in: body
 *        name: donor
 *        required: true
 *        description: The donor to update
 *        schema:
 *          $ref: '#/components/schemas/Donor'
 *    responses:
 *      200:
 *        description: Donor was deleted
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: boolean
 *                   example:
 *                      content: true
 *      401:
 *        description: User not authorized to access resource
 *      404:
 *        description: Donor with given id not found
 */
router.put(
  "/:id",
  authMiddleware.auth(roles.write_profile),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      if (req.params.id) {
        await DAO.donors.update(
          req.params.id,
          req.body.name,
          req.body.ssn,
          req.body.newsletter
        );

        return res.json({
          status: 200,
          content: true,
        });
      } else {
        return res.status(404).json({
          status: 404,
          content: "Couldn't update profile information",
        });
      }
    } catch (ex) {
      next(ex);
    }
  }
);

module.exports = router;
