import * as dotenv from "dotenv";
dotenv.config();

import * as config from "./config";
import { DAO } from "./custom_modules/DAO";

console.log("--------------------------------------------------");
console.log("| gieffektivt.no donation backend (╯°□°）╯︵ ┻━┻ |");
console.log("--------------------------------------------------");

import bearerToken from "express-bearer-token";
import compression from "compression";
import express from "express";
// Patches Express 4 so that rejected promises from async route handlers are passed to
// next(err) and reach the error handler instead of becoming unhandled rejections.
// Must be imported before any routers are created.
import "express-async-errors";
import fileUpload from "express-fileupload";
import honeypot from "honeypot";
import http from "http";
import logging from "./handlers/loggingHandler.js";
import pretty from "express-prettify";
import rateLimit from "express-rate-limit";
import { createPublicMutationLimiter } from "./middleware/publicMutationRateLimit";
import errorHandler from "./handlers/errorHandler";
import { importRouter } from "./routes/import";
import { resultsRouter } from "./routes/results";
import { tidbytRouter } from "./routes/tidbyt";
import { inflationRouter } from "./routes/inflation";
import { agreementfeedbackRouter } from "./routes/agreementfeedback";
import { fundraisersRouter } from "./routes/fundraisers";
import { ltvRouter } from "./routes/ltv";
import { organizationsRouter } from "./routes/organizations";
import { causeAreasRouter } from "./routes/causeareas";
import { surveyRouter } from "./routes/survey";
import { mcpRouter } from "./routes/mcp";
import { oauthRouter, sendAuthorizationServerMetadata } from "./routes/oauth";
import { getProtectedResourceMetadata } from "./custom_modules/mcp/oauthProtectedResource";
import { startWebSocketServer } from "./websocket";
import { mountTrpc } from "./trpc/express";
import { skipForTrpc } from "./trpc/reportsMultipart";
import { isPreviewMode } from "./custom_modules/preview/previewMode";
import { enforcePreviewEnvironment } from "./custom_modules/preview/environmentGuard";
import {
  noIndex,
  previewAdmin,
  previewDisabled,
  PREVIEW_DISABLED_PATHS,
} from "./custom_modules/preview/previewHttp";
import { createPreviewRouter } from "./routes/preview";

// Defence in depth: log stray rejections instead of letting Node's default
// (--unhandled-rejections=throw) terminate the whole API process.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

// Preview environments (docs/preview-environments.md): refuse to start unless this is a
// throwaway database on the previews instance with every production integration unset.
const previewMode = isPreviewMode();
if (previewMode) enforcePreviewEnvironment();

console.log("Top level dependencies loaded");

//Connect to the DB
//If unsucsessfull, quit app
DAO.connect(() => {
  console.log("DAO setup complete");

  //Setup express
  const app = express();

  if (previewMode) app.use(noIndex);

  //Setup request logging
  logging(app);

  if (previewMode) {
    app.use(PREVIEW_DISABLED_PATHS, previewDisabled);
    // The admin build in the preview image, same origin as the API
    const admin = previewAdmin(process.env.PREVIEW_ADMIN_DIR);
    if (admin) app.use(admin);
  }

  // A small, stable answer for anyone (or anything) poking the bare host.
  app.get("/", (_req, res) => {
    res.json({ name: "effekt-platform API", status: "ok" });
  });

  //Parse post body, capturing raw body for webhook signature verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );

  // MCP OAuth discovery (RFC 9728). Claude Tag fetches these before login.
  // Must be unauthenticated and reachable from Anthropic's egress.
  const sendProtectedResourceMetadata = (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(getProtectedResourceMetadata());
  };
  app.get("/.well-known/oauth-protected-resource", sendProtectedResourceMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", sendProtectedResourceMetadata);
  app.get("/.well-known/oauth-authorization-server", sendAuthorizationServerMetadata);

  // MCP OAuth (DCR + authorize/token). Claude registers here; we federate login to Auth0.
  app.use("/oauth", oauthRouter);

  //MCP server for Claude Tag (read-only analysis DB). Auth is an Auth0 JWT
  //with the analysis_mcp permission, not admin. Mounted before honeypot /
  //rate-limit / CORS so Anthropic server-to-server calls are not blocked.
  app.use("/mcp", mcpRouter);

  //Compress responses (gzip/brotli). Mounted after /mcp so its streamed (SSE) responses are not buffered.
  app.use(compression());

  // Tell browsers to only use HTTPS for the API hosts. No includeSubDomains: it would also
  // apply to every other *.gieffektivt.no host, which this service doesn't control.
  app.use((req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  //Pretty printing of JSON
  app.use(
    pretty({
      query: "pretty",
    }),
  );

  //File upload (not for /trpc, which parses multipart/form-data itself)
  app.use(
    skipForTrpc(
      fileUpload({
        limits: { fileSize: 10 * 1024 * 1024 }, //Probably totally overkill, consider reducing
      }),
    ),
  );
  // Exactly one trusted proxy hop: Cloud Run's Google Front End appends the real client IP
  // to X-Forwarded-For. Trusting more hops would let clients spoof req.ip (used by the
  // honeypot, rate limiter and the Swish callback IP allowlist) via their own XFF header.
  // Behind the external HTTPS load balancer there is one more hop (client, LB), so the
  // Norwegian service sets TRUST_PROXY_HOPS=2; the Swedish service is still on the domain mapping.
  app.set("trust proxy", config.trustProxyHops);

  //Honeypot
  const pot = new honeypot(config.honeypot_api_key);
  app.use((req, res, next) => {
    pot.query(req.ip, function (err, response) {
      if (!response) {
        next();
      } else {
        res.status(403).json({
          status: 403,
          content: "IP blacklisted",
        });
      }
    });
  });

  //Rate limiting
  app.use(
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 1000, //limit each IP to 50 requests per minute
      validate: {
        trustProxy: false,
      },
    }),
  );

  //Set cross origin as allowed
  app.use(function (req, res, next) {
    if (config.env === "production") {
      const remoteOrigin = req.get("Origin");
      const previewOriginRe = /^https:\/\/main-site-.*-effective-altruism-norway\.vercel\.app$/;

      const allowed =
        !!remoteOrigin &&
        (config.allowedProductionOrigins.includes(remoteOrigin) ||
          previewOriginRe.test(remoteOrigin));

      if (allowed) {
        res.setHeader("Access-Control-Allow-Origin", remoteOrigin);
        res.setHeader("Vary", "Origin");
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, baggage, sentry-trace, trpc-accept",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH,OPTIONS");
    next();
  });

  //Look for bearer tokens
  app.use(bearerToken());

  //Server
  const mainServer = http.createServer(app);

  //Routes
  const donorsRoute = require("./routes/donors");
  const donationsRoute = require("./routes/donations").default;
  const distributionsRoute = require("./routes/distributions");
  const causeareasRoute = causeAreasRouter;
  const organizationsRoute = organizationsRouter;
  const reportsRoute = require("./routes/reports");
  const vippsRoute = require("./routes/vipps");
  const swishRoute = require("./routes/swish").default;
  const paymentRoute = require("./routes/payment");
  const referralsRoute = require("./routes/referrals");
  const scheduledRoute = require("./routes/scheduled");
  const metaRoute = require("./routes/meta");
  const facebookRoute = require("./routes/facebook");
  const loggingRoute = require("./routes/logging");
  const mailRoute = require("./routes/mail");
  const avtaleGiroRoute = require("./routes/avtalegiro");
  const autoGiroRoute = require("./routes/autogiro");
  const taxRoute = require("./routes/tax");
  const tidbytRoute = tidbytRouter;
  const inflationRoute = inflationRouter;
  const agreementfeedbackRoute = agreementfeedbackRouter;
  const fundraisersRoute = fundraisersRouter;
  const ltvRoute = ltvRouter;

  if (previewMode) app.use("/preview", createPreviewRouter());

  //The public donation mutations: the widget's tRPC mutations and their REST counterparts
  const publicMutationLimiter = createPublicMutationLimiter();
  app.use("/donations/register", (req, res, next) =>
    req.method === "POST" ? publicMutationLimiter(req, res, next) : next(),
  );
  mountTrpc(app, { publicMutationLimiter });

  app.use("/donors", donorsRoute);
  app.use("/donations", donationsRoute);
  app.use("/distributions", distributionsRoute);
  app.use("/causeareas", causeareasRoute);
  app.use("/organizations", organizationsRoute);
  app.use("/reports", reportsRoute);
  app.use("/vipps", vippsRoute);
  app.use("/swish", swishRoute);
  app.use("/payment", paymentRoute);
  app.use("/referrals", referralsRoute);
  app.use("/scheduled", scheduledRoute);
  app.use("/meta", metaRoute);
  app.use("/facebook", facebookRoute);
  app.use("/logging", loggingRoute);
  app.use("/mail", mailRoute);
  app.use("/avtalegiro", avtaleGiroRoute);
  app.use("/autogiro", autoGiroRoute);
  app.use("/fundraisers", fundraisersRoute);
  app.use("/tax", taxRoute);
  app.use("/import", importRouter);
  app.use("/results", resultsRouter);
  app.use("/tidbyt", tidbytRoute);
  app.use("/inflation", inflationRoute);
  app.use("/agreementfeedback", agreementfeedbackRoute);
  app.use("/ltv", ltvRoute);
  app.use("/survey", surveyRouter);

  app.use("/static", express.static(__dirname + "/static"));
  app.use("/img", express.static(__dirname + "/views/img"));

  //Error handling
  app.use(errorHandler);

  app.use((req, res, next) => {
    res.status(404).json({
      status: 404,
      content: "Not found",
    });
  });

  mainServer.listen(parseInt(config.port), config.host, () => {
    console.log("Main http server listening on http://" + config.host + ":" + config.port + " 📞");

    startWebSocketServer(mainServer);

    console.log("Don't Panic. 🐬");
    console.log("---");
  });
});
