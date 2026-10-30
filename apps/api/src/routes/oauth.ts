import { Router, json, urlencoded } from "express";
import rateLimit from "express-rate-limit";
import {
  getAuthorizationServerMetadata,
  handleAuthorize,
  handleCallback,
  handleRegister,
  handleToken,
} from "../custom_modules/mcp/oauthAuthorizationServer";

export const oauthRouter = Router();

oauthRouter.use(json({ limit: "32kb" }));
oauthRouter.use(urlencoded({ extended: false, limit: "32kb" }));

oauthRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
  }),
);

export function sendAuthorizationServerMetadata(_req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(getAuthorizationServerMetadata());
}

oauthRouter.post("/register", handleRegister);
oauthRouter.get("/authorize", handleAuthorize);
oauthRouter.get("/callback", (req, res) => {
  void handleCallback(req, res);
});
oauthRouter.post("/token", (req, res) => {
  void handleToken(req, res);
});

export default oauthRouter;
