import * as express from "express";
import { checkDonor } from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import { fnr } from "@navikt/fnrvalidator";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";

const router = express.Router();
const roles = require("../enums/authorizationRoles");
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
router.post(
  "/",
  authMiddleware.isAdmin,
  urlEncodeParser,
  async (req, res, next) => {
    try {
      if (!req.body.name || !req.body.email) {
        let error = new Error("Missing param email or param name");
        throw error;
      }

      const existing = await DAO.donors.getIDbyEmail(req.body.email);

      if (existing !== null) {
        return res.status(409).json({
          status: 409,
          content: "Email already exists",
        });
      }

      const donorId = await DAO.donors.add(req.body.email, req.body.name);

      /**
       * If we are provided a social security number, we should add a tax unit to the donor
       */
      if (req.body.ssn) {
        if (req.body.ssn.length === 11) {
          // Birth number is 11 digits
          const validation = fnr(req.body.ssn);
          if (validation.status !== "valid") {
            return res.status(400).json({
              status: 400,
              content:
                "Invalid ssn (failed fnr validation) " +
                validation.reasons.join(", "),
            });
          }
        } else if (req.body.ssn.length === 9) {
          // Organization number is 9 digits
          // No validatino performed
        } else {
          return res.status(400).json({
            status: 400,
            content: "Invalid ssn (length is not 9 or 11)",
          });
        }

        await DAO.tax.addTaxUnit(donorId, req.body.ssn, req.body.name);
      }

      return res.json({
        status: 200,
        content: "OK",
      });
    } catch (ex) {
      next(ex);
    }
  }
);

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
      donorID = await DAO.donors.add(req.body.email, null, false);
    }

    res.json({
      status: 200,
      content: donorID,
    });
  } catch (ex) {
    next(ex);
  }
});

/**
 * @openapi
 * /donors/search:
 *   get:
 *    tags: [Donors]
 *    description: Search for donors in the database
 *    security:
 *       - auth0_jwt: [admin]
 *    parameters:
 *      - in: query
 *        name: q
 *        required: true
 *        description: A search string which fuzzy matches on name and email
 *        schema:
 *          type: string
 *    responses:
 *      200:
 *        description: Returns a list of donors
 *      401:
 *        description: User not authorized to view resource
 */
router.get("/search/", authMiddleware.isAdmin, async (req, res, next) => {
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
});

/**
 * @openapi
 * /donors/{id}:
 *   get:
 *    tags: [Donors]
 *    description: Get a donor by id
 *    security:
 *       - auth0_jwt: [read:profile]
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
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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
 * /donors/{id}/referrals:
 *   get:
 *    tags: [Donors]
 *    description: Get answers from referral question for donor by id
 *    security:
 *       - auth0_jwt: [read:profile]
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
 *                        $ref: '#/components/schemas/ReferralAnswer'
 *                   example:
 *                      content:
 *                        $ref: '#/components/schemas/ReferralAnswer/example'
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donor with given id not found
 */
router.get(
  "/:id/referrals",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      var answers = await DAO.referrals.getDonorAnswers(req.params.id);

      if (answers) {
        return res.json({
          status: 200,
          content: answers,
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
 * /donors/{id}/taxunits:
 *   get:
 *    tags: [Donors]
 *    description: Get all tax units associated with donor
 *    security:
 *       - auth0_jwt: [read:profile]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns an array of tax units
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content:
 *                        $ref: '#/components/schemas/TaxUnit'
 *                   example:
 *                      content:
 *                        $ref: '#/components/schemas/TaxUnit/example'
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donor with given id not found
 */
router.get(
  "/:id/taxunits",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      var taxUnits = await DAO.tax.getByDonorId(req.params.id);

      if (taxUnits) {
        return res.json({
          status: 200,
          content: taxUnits,
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
 *       - auth0_jwt: [write:donations]
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
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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
 * /donors/{id}/donations:
 *   get:
 *    tags: [Donors]
 *    description: Get donations by donor id
 *    security:
 *       - auth0_jwt: [read:donations]
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

/**
 * @openapi
 * /donors/{id}/recurring/avtalegiro:
 *   get:
 *    tags: [Donors]
 *    description: Get avtalegiro agreements by donorId
 *    security:
 *       - auth0_jwt: [read:donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve avtalegiro agreements from.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns avtalegiro agreements for given donorId
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
 *                            $ref: '#/components/schemas/AvtalegiroAgreement'
 *                   example:
 *                      content:
 *                         - $ref: '#/components/schemas/AvtalegiroAgreement/example'
 *      401:
 *        description: User not authorized to view resource
 */
router.get(
  "/:id/recurring/avtalegiro",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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

/**
 * @openapi
 * /donors/{id}/recurring/vipps:
 *   get:
 *    tags: [Donors]
 *    description: Get vipps agreements by donorId
 *    security:
 *       - auth0_jwt: [read:donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve vipps agreements from.
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns vipps agreements for given donoId
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
 *                            $ref: '#/components/schemas/VippsAgreement'
 *                   example:
 *                      content:
 *                         - $ref: '#/components/schemas/VippsAgreement/example'
 *      401:
 *        description: User not authorized to view resource
 */
router.get(
  "/:id/recurring/vipps",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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
 *       - auth0_jwt: [read:donations]
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
 * /donors/{id}/distributions:
 *   get:
 *    tags: [Donors]
 *    description: Get the distributions of a donor
 *    security:
 *       - auth0_jwt: [read:donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve distributions from.
 *        schema:
 *          type: integer
 *      - in: query
 *        name: kids
 *        required: false
 *        description: A list of KIDs seperated by a comma, to fetch only given distributions
 *        schema:
 *          type: string
 *    responses:
 *      200:
 *        description: Returns distributions for a donor
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
 *                            $ref: '#/components/schemas/Distribution'
 *                   example:
 *                      content:
 *                         - $ref: '#/components/schemas/Distribution/example'
 *      401:
 *        description: User not authorized to view resource
 */
router.get(
  "/:id/distributions/",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const result = await DAO.distributions.getAllByDonor(req.params.id);
      let distributions = result.distributions;

      if (req.query.kids) {
        const kidSet = new Set<string>();
        req.query.kids.split(",").map((kid) => kidSet.add(kid));

        distributions = distributions.filter((dist) => kidSet.has(dist.kid));
      }

      return res.json({
        status: 200,
        content: distributions,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

/**
 * @openapi
 * /donors/{id}/distributions/aggregated:
 *   get:
 *    tags: [Donors]
 *    description: Get the distributions of a donor with aggregated donations
 *    security:
 *       - auth0_jwt: [read:donations]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the user to retrieve aggregated distributions from
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns aggregated distributions for a donor
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
 *                            $ref: '#/components/schemas/AggregatedDistribution'
 *                   example:
 *                      content:
 *                         - $ref: '#/components/schemas/AggregatedDistribution/example'
 *      401:
 *        description: User not authorized to view resource
 */
router.get(
  "/:id/distributions/aggregated",
  authMiddleware.auth(roles.read_donations),
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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
  (req, res, next) => {
    checkDonor(parseInt(req.params.id), req, res, next);
  },
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
 *       - auth0_jwt: [write:profile]
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
      if (!donor) {
        return res.status(404).json({
          status: 404,
          content: "Couldn't find donor by id",
        });
      }
      // Check for name
      if (req.body.name) {
        if (typeof req.body.name !== "string") {
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

      // Check for newsletter
      if (req.body.newsletter) {
        if (typeof req.body.newsletter !== "boolean") {
          return res.status(400).json({
            status: 400,
            content: "The newsletter must be a boolean",
          });
        }
      }
      const updated = await DAO.donors.update(
        req.params.id,
        req.body.name,
        req.body.newsletter,
        req.body.trash
      );
      if (updated) {
        return res.json({
          status: 200,
          content: true,
        });
      } else {
        return res.status(500).json({
          status: 500,
          content: "Could not update donor",
        });
      }
    } catch (ex) {
      next(ex);
    }
  }
);

router.post(
  "/id/email/name",
  authMiddleware.isAdmin,
  async (req, res, next) => {
    try {
      let donorID;

      if (req.body.email) {
        donorID = await DAO.donors.getIDbyEmail(req.body.email);
      }

      if (donorID == null) {
        donorID = await DAO.donors.getIDByMatchedNameFB(req.body.name);
      }
      // If no email matches, get donorID by name instead

      return res.json({
        status: 200,
        content: donorID,
      });
    } catch (ex) {
      next(ex);
    }
  }
);

module.exports = router;
