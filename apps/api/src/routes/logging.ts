import * as express from "express";
import { DAO } from "../custom_modules/DAO";

const router = express.Router();
import * as authMiddleware from "../custom_modules/authorization/authMiddleware";
import { sendPasswordResetNoUserEmail } from "../custom_modules/mail";
import { requireAuthorizationSecret } from "../custom_modules/webhookAuth";
const config = require("../config");

router.post("/", authMiddleware.isAdmin, async (req, res, next) => {
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

/**
 * Receives events from the Auth0 custom webhook log stream. The log stream must be configured
 * with AUTH0_LOG_STREAM_TOKEN as its "Authorization Token" (sent as the Authorization header).
 */
const requireAuth0LogStreamToken = requireAuthorizationSecret(
  () => config.auth0_log_stream_token,
  "AUTH0_LOG_STREAM_TOKEN",
);

router.post("/auth0", requireAuth0LogStreamToken, async (req, res) => {
  // Send an email to the user with the error message if the error is a user does not exist error (fcpr)
  if (Array.isArray(req.body?.logs)) {
    for (const log of req.body.logs) {
      if (log?.data?.type === "fcpr") {
        const email = log.data.details?.body?.email;
        if (typeof email !== "string" || !email) continue;
        try {
          await sendPasswordResetNoUserEmail(email);
        } catch (ex) {
          console.error(ex);
        }
      }
    }
  }
  res.send("OK");
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
