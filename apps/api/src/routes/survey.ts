import { Router, RequestHandler } from "express";
import { timingSafeEqual } from "crypto";
import { DAO } from "../custom_modules/DAO";

const config = require("../config");

export const surveyRouter = Router();

/**
 * Guards the survey export endpoint with a static secret token read from the
 * SURVEY_EXPORT_SECRET environment variable. The token must be supplied as a
 * bearer token (`Authorization: Bearer <token>`), parsed into `req.token` by
 * the global express-bearer-token middleware.
 */
const surveyExportAuthMiddleware: RequestHandler = (req, res, next) => {
  const expected = config.survey_export_secret;
  const provided = (req as any).token;

  if (!expected) {
    res.status(503).json({
      status: 503,
      content: "Survey export endpoint is not configured",
    });
    return;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(typeof provided === "string" ? provided : "");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    res.status(401).json({
      status: 401,
      content: "Unauthorized",
    });
    return;
  }

  next();
};

/**
 * Dumps every stored MailerSend survey response as a single JSON array.
 * Intentionally unpaginated.
 */
surveyRouter.get("/responses", surveyExportAuthMiddleware, async (req, res, next) => {
  try {
    const responses = await DAO.mail.getAllMailerSendSurveyResponses();

    res.json({
      status: 200,
      content: responses,
    });
  } catch (ex) {
    next(ex);
  }
});

export default surveyRouter;
