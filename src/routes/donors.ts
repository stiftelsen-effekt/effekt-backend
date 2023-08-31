import * as express from "express";
import { checkAdminOrTheDonor } from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import { fnr } from "@navikt/fnrvalidator";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { TaxReport, TaxYearlyReportUnit } from "../schemas/types";
import permissions from "../enums/authorizationPermissions";
import bodyParser from "body-parser";

const router = express.Router();

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
router.post("/", authMiddleware.isAdmin, urlEncodeParser, async (req, res, next) => {
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

    const donorId = await DAO.donors.add({ email: req.body.email, full_name: req.body.name });

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
            content: "Invalid ssn (failed fnr validation) " + validation.reasons.join(", "),
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
      donorID = await DAO.donors.add({ email: req.body.email, full_name: null, newsletter: false });
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
router.post("/search/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    var donors = await DAO.donors.search(req.body);

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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
);

// A route to get yearly tax reports
/**
 * @openapi
 * /donors/{id}/taxreports:
 *  get:
 *   tags: [Donors]
 *   description: Get all tax reports associated with donor
 *   security:
 *     - auth0_jwt: [read:donations]
 *   parameters:
 *    - in: path
 *      name: id
 *      required: true
 *      description: Numeric ID of the user to retrieve.
 *      schema:
 *        type: integer
 *   responses:
 *    200:
 *      description: Returns an array of tax reports
 *      content:
 *        application/json:
 *          schema:
 *            allOf:
 *              - $ref: '#/components/schemas/ApiResponse'
 *              - type: object
 *                properties:
 *                  content:
 *                    $ref: '#/components/schemas/TaxReport'
 *                example:
 *                  content:
 *                    $ref: '#/components/schemas/TaxReport/example'
 *    401:
 *      description: User not authorized to view resource
 *    404:
 *      description: Donor with given id not found
 */
router.get(
  "/:id/taxreports",
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      if (isNaN(parseInt(req.params.id))) {
        return res.status(400).json({
          status: 400,
          content: "Invalid donor ID",
        });
      }

      let taxUnits = await DAO.tax.getByDonorId(parseInt(req.params.id));
      taxUnits = taxUnits.filter((tu) => tu.archived === null);

      let donations = await DAO.donations.getByDonorId(parseInt(req.params.id));
      let eaFundsDonations = await DAO.donations.getEAFundsDonations(parseInt(req.params.id));

      /**
       * TODO: This is hard coded to only include 2022 for now, but should be
       * changed to include all years in the future.
       */
      const year = 2022;

      const yearlyreportunits = taxUnits.map((tu): TaxYearlyReportUnit => {
        const fundsSumForUnit = eaFundsDonations
          .filter((d) => new Date(d.timestamp).getFullYear() === year && d.taxUnitId === tu.id)
          .reduce((acc, item) => acc + parseFloat(item.sum), 0);

        const geSumForYear = tu.taxDeductions.find((d) => d.year === year)?.sumDonations
          ? parseFloat(tu.taxDeductions.find((d) => d.year === year)?.sumDonations ?? "0")
          : 0;

        const completeSum = geSumForYear + fundsSumForUnit;

        let reportUnit: TaxYearlyReportUnit = {
          id: tu.id,
          name: tu.name,
          ssn: tu.ssn,
          sumDonations: completeSum,
          taxDeduction: Math.min(completeSum, 25000),
          channels: [],
        };

        if (parseFloat(tu.sumDonations) > 0) {
          reportUnit.channels.push({
            channel: "Gi Effektivt",
            sumDonations: geSumForYear,
          });
        }

        if (fundsSumForUnit > 0) {
          reportUnit.channels.push({
            channel: "EAN Giverportal",
            sumDonations: fundsSumForUnit,
          });
        }

        return reportUnit;
      });

      const cryptoDonationsInYear = donations.filter((d) => {
        return new Date(d.timestamp).getFullYear() === year && d.paymentMethod === "Crypto";
      });

      const sumGeDonationsWithoutTaxUnit = donations
        .filter((d) => {
          return new Date(d.timestamp).getFullYear() === year && d.taxUnitId === null;
        })
        .reduce((acc, item) => acc + parseFloat(item.sum), 0);

      const sumEanDOnationsWithoutTaxUnit = eaFundsDonations
        .filter((d) => {
          return new Date(d.timestamp).getFullYear() === year && d.taxUnitId === null;
        })
        .reduce((acc, item) => acc + parseFloat(item.sum), 0);

      const reports: Array<TaxReport> = [
        {
          year: year,
          units: yearlyreportunits,
          sumDonations: yearlyreportunits.reduce((a, b) => a + b.sumDonations, 0),
          sumTaxDeductions: yearlyreportunits.map((u) => u.taxDeduction).reduce((a, b) => a + b, 0),
          sumDonationsWithoutTaxUnit: {
            sumDonations: sumGeDonationsWithoutTaxUnit + sumEanDOnationsWithoutTaxUnit,
            channels: [
              {
                channel: "Gi Effektivt",
                sumDonations: sumGeDonationsWithoutTaxUnit,
              },
              {
                channel: "EAN Giverportal",
                sumDonations: sumEanDOnationsWithoutTaxUnit,
              },
            ],
          },
          sumNonDeductibleDonationsByType:
            cryptoDonationsInYear.length > 0
              ? [
                  {
                    type: "Crypto",
                    sumNonDeductibleDonations: cryptoDonationsInYear
                      .map((d) => parseFloat(d.sum))
                      .reduce((a, b) => a + b, 0),
                  },
                ]
              : [],
        },
      ];

      return res.json({
        status: 200,
        content: reports,
      });
    } catch (ex) {
      next(ex);
    }
  },
);

/**
 * @openapi
 * /donors/{id}/taxunits:
 *   post:
 *    tags: [Donors]
 *    description: Create a new tax unit for the given donor
 *    security:
 *       - auth0_jwt: [write:profile]
 *    parameters:
 *      - in: body
 *        name: name
 *        required: true
 *        description: The name of the tax unit
 *        schema:
 *          type: string
 *      - in: body
 *        name: ssn
 *        required: true
 *        description: The social security number of the tax unit (organization number or personal number)
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
router.post(
  "/:id/taxunits",
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const { name, ssn } = req.body;

      if (!name || !ssn) {
        return res.status(400).json({
          status: 400,
          content: "Missing required fields",
        });
      }

      if (ssn.length === 11) {
        // Birth number is 11 digits
        const validation = fnr(req.body.ssn);
        if (validation.status !== "valid") {
          return res.status(400).json({
            status: 400,
            content: "Invalid ssn (failed fnr validation) " + validation.reasons.join(", "),
          });
        }
      } else if (ssn.length === 9) {
        // Organization number is 9 digits
        // No validatino performed
      } else {
        return res.status(400).json({
          status: 400,
          content: "Invalid ssn (length is not 9 or 11)",
        });
      }

      const donor = await DAO.donors.getByID(req.params.id);
      if (!donor) {
        return res.status(404).json({
          status: 404,
          content: "No donor found with ID " + req.params.id,
        });
      }

      var taxUnitId = await DAO.tax.addTaxUnit(donor.id, ssn, name);
      const taxUnit = await DAO.tax.getById(taxUnitId);

      // If successfully created tax unit
      if (taxUnit) {
        const taxUnits = await DAO.tax.getByDonorId(donor.id);

        // if this is the first tax unit created for the donor (also counts archived tax units)
        if (taxUnits.length === 1) {
          // Update the donor's KID numbers missing a tax unit
          await DAO.tax.updateKIDsMissingTaxUnit(taxUnitId, donor.id);
        }

        return res.json({
          status: 200,
          content: taxUnit,
        });
      } else {
        return res.status(500).json({
          status: 500,
          content: "Failed to create tax unit",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
);

// Route for deleting tax unit from donor by donor id and tax unit id
/**
 * @openapi
 * /donors/{id}/taxunits/{taxunitid}:
 *   delete:
 *    tags: [Donors]
 *    description: Delete a tax unit from a donor
 *    security:
 *      - auth0_jwt: [write:profile]
 *    parameters:
 *      - in: path
 *        name: id
 *        required: true
 *        description: Numeric ID of the donor to retrieve.
 *        schema:
 *          type: integer
 *      - in: path
 *        name: taxunitid
 *        required: true
 *        description: Numeric ID of the tax unit to delete.
 *        schema:
 *          type: integer
 *      - in: body
 *        name: transferId
 *        required: false
 *        description: Numeric ID of the tax unit to transfer donations to the given tax unit for current year to
 *        schema:
 *          type: integer
 *    responses:
 *      200:
 *        description: Returns a status message for wether the unit was deleted
 *        content:
 *          application/json:
 *            schema:
 *              allOf:
 *                - $ref: '#/components/schemas/ApiResponse'
 *                - type: object
 *                  properties:
 *                    content:
 *                      type: boolean
 *                  example:
 *                    content: true
 *      401:
 *        description: User not authorized to view resource
 *      404:
 *        description: Donor with given id not found, or tax unit with given id not found
 *      500:
 *        description: Failed to delete tax unit
 */
router.delete(
  "/:id/taxunits/:taxunitid",
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const donor = await DAO.donors.getByID(req.params.id);
      if (!donor) {
        return res.status(404).json({
          status: 404,
          content: "No donor found with ID " + req.params.id,
        });
      }

      const taxUnit = await DAO.tax.getById(req.params.taxunitid);
      if (!taxUnit) {
        return res.status(404).json({
          status: 404,
          content: "No tax unit found with ID " + req.params.taxunitid,
        });
      }

      const deleted = await DAO.tax.deleteById(taxUnit.id, donor.id, req.body.transferId);
      if (deleted) {
        return res.json({
          status: 200,
          content: true,
        });
      } else {
        return res.status(500).json({
          status: 500,
          content: "Failed to delete tax unit",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
);

/**
 * @openapi
 * /donors/{id}/taxunits/{taxunitid}:
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
router.put(
  "/:id/taxunits/:taxunitid",
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const id = req.params.id;
      const taxUnitId = parseInt(req.params.taxunitid);
      const taxUnit = req.body.taxUnit;
      const ssn = taxUnit.ssn;

      if (!id || !taxUnitId || !taxUnit) {
        res.status(400).json({
          status: 400,
          content: "Missing parameters id or taxUnitid or taxUnit in json body",
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

      if (ssn.length === 11) {
        // Birth number is 11 digits
        const validation = fnr(ssn);
        if (validation.status !== "valid") {
          return res.status(400).json({
            status: 400,
            content: "Invalid ssn (failed fnr validation) " + validation.reasons.join(", "),
          });
        }
      } else if (ssn.length === 9) {
        // Organization number is 9 digits
        // No validatino performed
      } else {
        return res.status(400).json({
          status: 400,
          content: "Invalid ssn (length is not 9 or 11)",
        });
      }

      const donor = await DAO.donors.getByID(req.params.id);
      if (!donor) {
        return res.status(404).json({
          status: 404,
          content: "No donor found with ID " + req.params.id,
        });
      }

      const changed = await DAO.tax.updateTaxUnit(taxUnitId, taxUnit);
      if (changed) {
        res.json({
          status: 200,
          content: taxUnit,
        });
      } else {
        res.json({
          status: 500,
          content: "Could not update tax unit",
        });
      }
    } catch (ex) {
      next(ex);
    }
  },
);

/**
 * @openapi
 * /donors/{id}:
 *   delete:
 *    tags: [Donors]
 *    description: Get a donor by id
 *    security:
 *      - auth0_jwt: [write:donations]
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
  authMiddleware.auth(permissions.write_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const agreements = await DAO.avtalegiroagreements.getByDonorId(req.params.id);

      return res.json({
        status: 200,
        content: agreements,
      });
    } catch (ex) {
      next(ex);
    }
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const aggregated = await DAO.donations.getYearlyAggregateByDonorId(req.params.id);

      return res.json({
        status: 200,
        content: aggregated,
      });
    } catch (ex) {
      next(ex);
    }
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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

      const requests = [];
      for (let i = 0; i < distributions.length; i++) {
        const dist = distributions[i];
        requests.push(getDistributionTaxUnitAndStandardDistribution(i, dist.kid));
      }

      const results = await Promise.all(requests);
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        distributions[result.index].taxUnit = result.taxUnit;
        distributions[result.index].standardDistribution = result.standardDistribution;
      }

      return res.json({
        status: 200,
        content: distributions,
      });
    } catch (ex) {
      next(ex);
    }
  },
);

async function getDistributionTaxUnitAndStandardDistribution(index, kid) {
  // !!! === CAUSE AREAS TODO === !!!
  throw new Error("Not implemented");
  /*
  const taxUnit = await DAO.tax.getByKID(kid);
  const standardDistribution = await DAO.distributions.isStandardDistribution(kid);
  return {
    index: index,
    taxUnit: taxUnit,
    standardDistribution: standardDistribution,
  };
  */
}

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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
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
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
  },
);

// A route for getting all the donations to EA funds for a given donor ID
router.get(
  "/:id/funds/donations/",
  authMiddleware.auth(permissions.read_donations),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      var donations = await DAO.donations.getEAFundsDonations(req.params.id);

      res.json({
        status: 200,
        content: donations,
      });
    } catch (ex) {
      next(ex);
    }
  },
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
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
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
        req.body.trash,
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
  },
);

router.post("/id/email/name", authMiddleware.isAdmin, async (req, res, next) => {
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
});

module.exports = router;
