import * as express from "express";
import { DAO } from "../custom_modules/DAO";

const router = express.Router();
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendPasswordResetNoUserEmail } from "../custom_modules/mail";
const roles = require("../enums/authorizationRoles");

/**
 * @openapi
 * tags:
 *   - name: Logging
 *     description: Log entries in the database. Used for logging scheduled events, such as daily imports of bank donations, processing of recurring vipps donations etc.
 */

/**
 * @openapi
 * /logging/:
 *   post:
 *    tags: [Logging]
 *    description: Get a paginated overview of log entries
 *    parameters:
 *      - in: body
 *        schema:
 *          type: object
 *          properties:
 *            limit:
 *              required: true
 *              description: The number of results to return
 *              example: 25
 *              type: integer
 *            offset:
 *              required: true
 *              description: The offset for the results. 0 to get the rows from 0 to limit.
 *              example: 0
 *              type: integer
 *            filesearch:
 *              required: false
 *              description: Filter results by a fuzzy string match in the log file json. E.g. return only logs with a specific KID in the log json.
 *              example: "002370000101"
 *              type: integer
 *    responses:
 *      200:
 *        description: Log entries returned
 *        content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                      content:
 *                        allOf:
 *                          - $ref: '#/components/schemas/Pagination'
 *                          - type: object
 *                            properties:
 *                              rows:
 *                                type: array
 *                                items:
 *                                  $ref: '#/components/schemas/LogEntry'
 *                   example:
 *                     status: 200
 *                     content:
 *                        allOf:
 *                         - $ref: '#/components/schemas/Pagination/example'
 *                         - properties:
 *                             rows:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/LogEntry/example'
 *
 *      401:
 *        description: User not authorized to access resource
 *      500:
 *        description: Internal server error
 */
router.post("/", async (req, res, next) => {
  try {
    const limit = parseInt(req.body.limit);
    const offset = parseInt(req.body.page) * limit;
    const filesearch = req.body.filesearch;

    const entries = await DAO.logging.getEntries(limit, offset, filesearch);

    res.json({
      status: 200,
      content: {
        rows: entries.results,
        pages: entries.pages,
      },
    });
  } catch (ex) {
    next(ex);
  }
});

router.post("/auth0", async (req, res, next) => {
  console.log(req.body)

  // Send an email to the user with the error message if the error is a user does not exist error (fcpr)
  if (req.body.data.type === "fcpr") {
    const email = req.body.data.details.body.email;
    await sendPasswordResetNoUserEmail(email);
  }
});

router.get("/:id", authMiddleware.isAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const entry = await DAO.logging.get(id);

    res.json({
      status: 200,
      content: entry,
    });
  } catch (ex) {
    next(ex);
  }
});

module.exports = router;
