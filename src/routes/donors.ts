import * as express from "express";
import { initParams } from "request";
import { checkDonor } from "../custom_modules/authorization/authMiddleware";
const router = express.Router();
const authMiddleware = require("../custom_modules/authorization/authMiddleware");
const roles = require("../enums/authorizationRoles");
const DAO = require("../custom_modules/DAO");
const bodyParser = require("body-parser");
const urlEncodeParser = bodyParser.urlencoded({ extended: false });
const validator = require('@navikt/fnrvalidator')

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
 * /donors/auth0/register:
 *   post:
 *    tags: [Donors]
 *    description: Gets a donor id by email if found, creates a new donor if email is not found
 *    parameters:
 *      - in: body
 *        name: email
 *        required: true
 *        description: The email of the donor that is registered
 *        schema:
 *          type: object
 *          properties:
 *            email:
 *              type: string
 *              example: "jack.torrence@overlookhotel.com"
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
 *      400:
 *        description: Bad request, missing email in request body
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content: number
 *                   example:
 *                      status: 400
 *                      content: "email is missing in request body"
 */
router.post("/auth0/register", async (req, res, next) => {
  try {
    if (!req.body.email) {
      res.status(400).json({
        status: 400,
        content: "email is missing in request body",
      });
    }

    let donorID = await DAO.donors.getIDbyEmail(req.body.email);

    if (donorID === null) {
      donorID = await DAO.donors.add(req.body.email, null, null, false)
    }

    res.json({
      status: 200,
      content: donorID,
    });
  } catch (ex) {
    next(ex);
  }
})

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
 *   get:
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


/**
 * @openapi
 * /donors/{id}/donations:
 *   get:
 *    tags: [Donors]
 *    description: Get donations by donor id
 *    security:
 *       - oAuth: [read_donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve donations from.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns donations for given donor id
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
 *                            $ref: '#/components/schemas/Donation'
 *                   example:
 *                      content:
 *                         - $ref: '#/components/schemas/Donation/example'
 *      401:
 *        description: User not authorized to view resource
 */
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
      const donor = await DAO.donors.getByID(req.params.id);
      if(!donor) {
        return res.status(404).json({
          status: 404,
          content: "Couldn't find donor by id",
        });
      }
      // Check for name
      if(req.body.name){
        if(typeof req.body.name !== 'string') {
          return res.status(400).json({
            status: 400,
            content: "The name must be a string",
          });
        } 
      } else {
        return res.status(400).json({
          status: 400,
          content: "The name cannot be null",
        });
      }
      // Check for SSN, validator from https://github.com/navikt/fnrvalidator
      if(req.body.ssn){
        if(validator.fnr((req.body.ssn).toString()).status === 'invalid') {
          return res.status(400).json({
            status: 400,
            content: "The SSN is invalid, it must be 11 numbers in one word",
          });
        }
      } else {
        return res.status(400).json({
          status: 400,
          content: "The SSN cannot be null",
        });
      }
      // Check for newsletter
      if(req.body.newsletter){
        if(typeof req.body.newsletter !== 'boolean') {
          return res.status(400).json({
            status: 400,
            content: "The newsletter must be a boolean",
          });
        }
      }
      const updated = await DAO.donors.update(
        req.params.id,
        req.body.name,
        req.body.ssn,
        req.body.newsletter
      );
      if(updated){
        return res.json({
          status: 200,
          content: true,
        });
     } else{
        return res.status(500).json({
          status: 500,
          content: "Could not update donor"
        })
     }
    } catch (ex) {
      next(ex);
    }
  }
);

module.exports = router;