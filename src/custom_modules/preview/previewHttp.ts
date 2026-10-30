/**
 * HTTP pieces only used with PREVIEW_MODE=true: noindex header, the built admin served from the
 * same origin, and routes switched off in previews.
 */
import compression from "compression";
import express, { type RequestHandler } from "express";
import fs from "fs";
import path from "path";

/** Every response of a preview: keep it out of search engines. */
export const noIndex: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
};

/**
 * Routes that make no sense (or would reach external systems) in a preview: scheduled jobs
 * (Cloud Scheduler is never set up for previews), the analysis MCP and its OAuth proxy.
 */
export const PREVIEW_DISABLED_PATHS = [
  "/scheduled",
  "/mcp",
  "/oauth",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
];

export const previewDisabled: RequestHandler = (_req, res) => {
  res.status(404).json({ status: 404, content: "Disabled in preview environments" });
};

/** API paths that must never fall back to the admin's index.html. */
const API_ONLY_PREFIXES = [
  "/api-docs",
  "/oauth2-redirect.html",
  "/trpc",
  "/preview",
  "/static",
  "/img",
  "/.well-known",
  "/mcp",
  "/oauth",
];

const isBrowserNavigation = (req: express.Request) =>
  (req.method === "GET" || req.method === "HEAD") &&
  (req.headers.accept ?? "").includes("text/html") &&
  !API_ONLY_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));

/**
 * The built admin (admin/dist) at the site root: hashed assets with a long cache, and
 * index.html for browser navigations (the admin uses real paths such as /donors/12, which
 * overlap REST prefixes; API calls don't ask for text/html, so they still reach the API).
 * Returns undefined when the directory doesn't exist.
 */
export const previewAdmin = (adminDir: string | undefined): express.Router | undefined => {
  if (!adminDir) return undefined;
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- adminDir is PREVIEW_ADMIN_DIR set in Dockerfile.preview, not request input
  const indexFile = path.join(adminDir, "index.html");
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename.detect-non-literal-fs-filename -- path built from PREVIEW_ADMIN_DIR (Dockerfile.preview), not request input
  if (!fs.existsSync(indexFile)) return undefined;

  const router = express.Router();
  router.use(compression());
  router.use(
    "/assets",
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- adminDir is PREVIEW_ADMIN_DIR set in Dockerfile.preview, not request input
    express.static(path.join(adminDir, "assets"), {
      immutable: true,
      maxAge: "365d",
      index: false,
    }),
  );
  router.use(express.static(adminDir, { index: false, maxAge: 0 }));
  router.use((req, res, next) => {
    if (!isBrowserNavigation(req)) return next();
    res.setHeader("Cache-Control", "no-cache");
    // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile -- fixed index.html under PREVIEW_ADMIN_DIR, not request input
    res.sendFile(indexFile);
  });
  return router;
};
