import { Router, json, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import * as crypto from "crypto";
import config from "../config";
import { handleJsonRpcMessage } from "../custom_modules/mcp/analysisMcpServer";
import { isAnalysisDbConfigured } from "../custom_modules/analysisDbPool";
import { isAnalysisMcp } from "../custom_modules/authorization/authMiddleware";
import { sendMcpAuthChallenge } from "../custom_modules/mcp/oauthProtectedResource";

/**
 * Remote MCP endpoint for Claude Tag / Claude custom connectors.
 *
 * Auth (either is enough):
 * - Auth0 JWT with the analysis_mcp permission (user-login connector OAuth
 *   or the dedicated M2M app — not admin).
 * - Optional MCP_SECRET as Authorization: Bearer, for local testing only.
 *
 * Unauthenticated requests return 401 with WWW-Authenticate pointing at
 * RFC 9728 protected-resource metadata so Claude can start Auth0 login.
 *
 * Transport: MCP Streamable HTTP. Requests are answered with a single
 * application/json JSON-RPC response; notifications get 202 with no body.
 */

export const mcpRouter = Router();

// Parse JSON bodies for this router regardless of global middleware ordering.
mcpRouter.use(json({ limit: "1mb" }));

// Modest rate limit to protect the database, independent of the global limiter.
mcpRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
  }),
);

function getBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

/** Constant-time secret comparison that does not leak length. */
function secretMatches(provided: string): boolean {
  const expected = config.mcp_secret;
  if (!expected || typeof provided !== "string") return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  if (!isAnalysisDbConfigured()) {
    return res.status(404).end();
  }

  const token = getBearerToken(req);
  if (config.env !== "production" && config.mcp_secret && token && secretMatches(token)) {
    return next();
  }

  // No Bearer token: challenge so Claude discovers Auth0 via PRM.
  if (!token) {
    return sendMcpAuthChallenge(res);
  }

  const [checkJwt, checkPermission] = isAnalysisMcp;
  checkJwt(req, res, (err?: any) => {
    if (err) return sendMcpAuthChallenge(res);
    checkPermission(req, res, (permErr?: any) => {
      if (permErr) return sendMcpAuthChallenge(res, "insufficient_scope");
      next();
    });
  });
}

mcpRouter.use(requireMcpAuth);

// MCP clients may open a GET stream or DELETE a session; we are stateless.
mcpRouter.get("/", (_req, res) => res.status(405).end());
mcpRouter.delete("/", (_req, res) => res.status(405).end());

mcpRouter.post("/", async (req, res) => {
  const body = req.body;

  try {
    if (Array.isArray(body)) {
      // JSON-RPC batch: collect responses to requests, drop notifications.
      const responses = [];
      for (const msg of body) {
        const r = await handleJsonRpcMessage(msg);
        if (r !== null) responses.push(r);
      }
      if (responses.length === 0) return res.status(202).end();
      return res.json(responses);
    }

    const response = await handleJsonRpcMessage(body);
    if (response === null) return res.status(202).end();
    return res.json(response);
  } catch (ex) {
    console.error("MCP route error:", ex);
    return res.status(500).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Internal error" },
    });
  }
});

export default mcpRouter;
