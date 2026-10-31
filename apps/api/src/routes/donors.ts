import * as express from "express";
import { checkAdminOrTheDonor } from "../custom_modules/authorization/authMiddleware";
import { DAO } from "../custom_modules/DAO";
import { fnr } from "@navikt/fnrvalidator";
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import permissions from "../enums/authorizationPermissions";
import bodyParser from "body-parser";
import { LocaleRequest, localeMiddleware } from "../middleware/locale";
import {
  DonorServiceError,
  archiveTaxUnit,
  createDonor,
  createTaxUnitForDonor,
  mergeDonors,
} from "../custom_modules/donorService";
import { exportCsv } from "../custom_modules/csvexport";
import { requireAuthorizationSecret } from "../custom_modules/webhookAuth";

const config = require("../config");

const router = express.Router();

const urlEncodeParser = bodyParser.urlencoded({ extended: false });

// Ownership checks parseInt the id but the DAO gets the raw string, which MySQL reads
// differently (e.g. "1.2e4" is 1 to parseInt and 12000 to MySQL). Only allow plain integers.
const requireIntegerParam: express.RequestParamHandler = (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return res.status(400).json({ status: 400, content: "Invalid id" });
  next();
};
router.param("id", requireIntegerParam);
router.param("taxunitid", requireIntegerParam);

router.post("/", authMiddleware.isAdmin, urlEncodeParser, async (req, res, next) => {
  try {
    if (!req.body.name || !req.body.email) {
      let error = new Error("Missing param email or param name");
      throw error;
    }

    let donorId: number;
    try {
      donorId = await createDonor(req.body.email, req.body.name);
    } catch (ex) {
      if (ex instanceof DonorServiceError) {
        return res.status(ex.httpStatus).json({ status: ex.httpStatus, content: ex.message });
      }
      throw ex;
    }

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
 * Called by the Auth0 "Connect user id" pre-registration Action. The Action must send
 * AUTH0_REGISTER_TOKEN (stored as an Action secret) in the Authorization header; otherwise anyone
 * could look up donor IDs by email or create donors.
 *
 * The Swedish API runs the same image but is called by a separate Auth0 tenant that doesn't send
 * the token, so the check only applies where AUTH0_REGISTER_TOKEN is configured.
 */
const checkAuth0RegisterToken = requireAuthorizationSecret(
  () => config.auth0_register_token,
  "AUTH0_REGISTER_TOKEN",
);
const requireAuth0RegisterToken: express.RequestHandler = (req, res, next) =>
  config.auth0_register_token ? checkAuth0RegisterToken(req, res, next) : next();

router.post("/auth0/register", requireAuth0RegisterToken, async (req, res, next) => {
  try {
    const email = req.body.email;
    if (typeof email !== "string" || !email) {
      return res.status(400).json({
        status: 400,
        content: "email is missing in request body",
      });
    }

    let donorID = await DAO.donors.getIDbyEmail(email);

    if (donorID === null) {
      donorID = await DAO.donors.add({ email, full_name: null, newsletter: false });
    }

    res.json({
      status: 200,
      content: donorID,
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/list/", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    if (req.body.export === true) {
      const results = await DAO.donors.getAll(
        req.body.sort,
        0,
        Number.MAX_SAFE_INTEGER,
        req.body.filter,
        req.locale,
      );

      return exportCsv(res, results.rows, `donors-${new Date().toISOString()}.csv`);
    }

    if (typeof req.body.page === "undefined" || typeof req.body.limit === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing required fields: page, limit",
      });
    }

    var results = await DAO.donors.getAll(
      req.body.sort,
      req.body.page,
      req.body.limit,
      req.body.filter,
      req.locale,
    );
    return res.json({
      status: 200,
      content: {
        rows: results.rows,
        pages: results.pages,
        statistics: results.statistics,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

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

router.get(
  "/:id/taxunits",
  authMiddleware.auth(permissions.read_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  localeMiddleware,
  async (req: LocaleRequest, res, next) => {
    try {
      const donorId = parseInt(req.params.id);

      if (isNaN(donorId)) {
        return res.status(400).json({
          status: 400,
          content: "Invalid donor ID",
        });
      }

      var taxUnits = await DAO.tax.getByDonorId(donorId, req.locale);

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

router.post(
  "/:id/taxunits",
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  localeMiddleware,
  async (req: LocaleRequest, res, next) => {
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
      } else if (ssn.length === 13) {
        // Temp no validation for SE numbers
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

      const taxUnit = await createTaxUnitForDonor(donor.id, ssn, name, req.locale);

      // If successfully created tax unit
      if (taxUnit) {
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
router.delete(
  "/:id/taxunits/:taxunitid",
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      let deleted: number;
      try {
        deleted = await archiveTaxUnit(
          parseInt(req.params.id),
          parseInt(req.params.taxunitid),
          req.body.transferId,
        );
      } catch (ex) {
        if (ex instanceof DonorServiceError) {
          return res.status(ex.httpStatus).json({ status: ex.httpStatus, content: ex.message });
        }
        throw ex;
      }
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

router.put(
  "/:id/taxunits/:taxunitid",
  authMiddleware.auth(permissions.write_profile),
  (req, res, next) => {
    checkAdminOrTheDonor(parseInt(req.params.id), req, res, next);
  },
  async (req, res, next) => {
    try {
      const donorId = parseInt(req.params.id);
      const taxUnitId = parseInt(req.params.taxunitid);
      const body = req.body.taxUnit;

      if (!donorId || !taxUnitId || !body) {
        res.status(400).json({
          status: 400,
          content: "Missing parameters id or taxUnitid or taxUnit in json body",
        });
        return;
      }

      if (!body.name || !body.ssn) {
        res.status(400).json({
          status: 400,
          content: "Missing parameters name or ssn on tax unit",
        });
        return;
      }
      if (typeof body.name !== "string" || typeof body.ssn !== "string") {
        return res.status(400).json({
          status: 400,
          content: "name and ssn on the tax unit must be strings",
        });
      }
      const taxUnit = body;
      const ssn: string = body.ssn;

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

      const donor = await DAO.donors.getByID(donorId);
      if (!donor) {
        return res.status(404).json({
          status: 404,
          content: "No donor found with ID " + donorId,
        });
      }

      // Ensure the tax unit belongs to the donor in the path. checkAdminOrTheDonor only
      // authorizes the caller against :id, not against :taxunitid.
      const existingTaxUnit = await DAO.tax.getById(taxUnitId);
      if (!existingTaxUnit || existingTaxUnit.donorId !== donor.id) {
        return res.status(404).json({
          status: 404,
          content: "No tax unit found with ID " + taxUnitId + " for donor " + donor.id,
        });
      }

      // Only name and ssn are updated; the rest of the object Min Side sends back is ignored
      const changed = await DAO.tax.updateTaxUnit(taxUnitId, {
        ...existingTaxUnit,
        name: body.name as string,
        ssn,
      });
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
        // Min Side edits agreements by id, so the url code from the Vipps agreement link is not exposed
        content: agreements.map(({ agreement_url_code, ...agreement }) => agreement),
      });
    } catch (ex) {
      next(ex);
    }
  },
);

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

router.post("/:originId/merge/:destinationId", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const originId = parseInt(req.params.originId);
    const destinationId = parseInt(req.params.destinationId);

    if (isNaN(originId) || isNaN(destinationId)) {
      return res.status(400).json({
        status: 400,
        content: "Invalid donor ID",
      });
    }

    try {
      await mergeDonors(originId, destinationId);
    } catch (ex) {
      if (ex instanceof DonorServiceError) {
        return res.status(ex.httpStatus).json({ status: ex.httpStatus, content: ex.message });
      }
      throw ex;
    }

    return res.json({
      status: 200,
      content: true,
    });
  } catch (ex) {
    next(ex);
  }
});

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
      const { name, newsletter, trash } = req.body;

      // Check for name
      if (!name) {
        return res.status(400).json({
          status: 400,
          content: "The name cannot be null",
        });
      }
      if (typeof name !== "string") {
        return res.status(400).json({
          status: 400,
          content: "The name must be a string",
        });
      }

      // Newsletter and trash are optional booleans
      let newsletterFlag: boolean | null = null;
      if (typeof newsletter === "boolean") {
        newsletterFlag = newsletter;
      } else if (newsletter != null) {
        return res.status(400).json({
          status: 400,
          content: "The newsletter must be a boolean",
        });
      }
      // GET /donors/:id returns trash as 0/1, and Min Side sends the donor object back as is
      if (typeof trash !== "boolean" && trash != null && trash !== 0 && trash !== 1) {
        return res.status(400).json({
          status: 400,
          content: "Trash must be a boolean",
        });
      }

      // If no email is provided, keep the existing email
      let email: string = donor.email;
      const bodyEmail = req.body.email;
      if (bodyEmail) {
        if (typeof bodyEmail !== "string") {
          return res.status(400).json({
            status: 400,
            content: "The email must be a string",
          });
        }
        email = bodyEmail;
      }

      const updated = await DAO.donors.update(
        req.params.id,
        name,
        email,
        newsletterFlag,
        trash == null ? undefined : Boolean(trash),
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
