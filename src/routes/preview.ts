import express from "express";
import { z } from "zod";
import {
  findPreviewUser,
  previewUsers,
  signPreviewToken,
} from "../custom_modules/preview/previewMode";

/**
 * Preview environments only (mounted when PREVIEW_MODE=true): "Continue as…" sessions and the
 * facts shown in the admin's preview banner. See docs/preview-environments.md.
 */
export const createPreviewRouter = (env: NodeJS.ProcessEnv = process.env) => {
  const router = express.Router();

  const sessionInput = z.object({ as: z.enum(["ops", "finance", "approver"]) });

  router.post("/session", (req, res) => {
    const parsed = sessionInput.safeParse(req.body);
    const user = parsed.success ? findPreviewUser(parsed.data.as) : undefined;
    if (!user) {
      res
        .status(400)
        .json({ status: 400, content: 'Body must be {"as": "ops" | "finance" | "approver"}' });
      return;
    }
    const { accessToken, expiresIn } = signPreviewToken(user, env.PREVIEW_JWT_SECRET);
    res.setHeader("Cache-Control", "no-store");
    res.json({ accessToken, expiresIn, user });
  });

  router.get("/info", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      pr: env.PREVIEW_PR || null,
      sha: env.PREVIEW_SHA || null,
      seededAt: env.PREVIEW_SEEDED_AT || null,
      users: previewUsers,
    });
  });

  return router;
};
