import * as dotenv from "dotenv";
dotenv.config();

import * as config from "./config";
import { DAO } from "./custom_modules/DAO";
import { openAPIOptions, swaggerOptions } from "./openapi-config";

console.log("--------------------------------------------------");
console.log("| gieffektivt.no donation backend (╯°□°）╯︵ ┻━┻ |");
console.log("--------------------------------------------------");

import bearerToken from "express-bearer-token";
import express from "express";
import fileUpload from "express-fileupload";
import hogan from "hogan-express";
import honeypot from "honeypot";
import http from "http";
import logging from "./handlers/loggingHandler.js";
import pretty from "express-prettify";
import rateLimit from "express-rate-limit";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import qs from "qs";
import errorHandler from "./handlers/errorHandler";

const openapiSpecification = swaggerJsdoc(openAPIOptions);

console.log("Top level dependencies loaded");

//Connect to the DB
//If unsucsessfull, quit app
DAO.connect(() => {
  console.log("DAO setup complete");

  //Setup express
  const app = express();

  //Setup request logging
  logging(app);

  app.get("/api-docs/swagger.json", (req, res) => res.json(openapiSpecification));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpecification, swaggerOptions));
  app.get("/oauth2-redirect.html", (req, res, next) =>
    res.redirect(`/api-docs/oauth2-redirect.html?${qs.stringify(req.query)}`),
  );
  app.get("/", async (req, res, next) => {
    res.redirect("/api-docs/");
  });

  //Parse post body
  app.use(express.json());

  //Pretty printing of JSON
  app.use(
    pretty({
      query: "pretty",
    }),
  );

  //File upload
  app.use(
    fileUpload({
      limits: { fileSize: 10 * 1024 * 1024 }, //Probably totally overkill, consider reducing
    }),
  );
  app.enable("trust proxy");

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
    new rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 1000, //limit each IP to 50 requests per minute
      delayMs: 0, // disable delaying - full speed until the max limit is reached
    }),
  );

  //Set cross origin as allowed
  app.use(function (req, res, next) {
    if (config.env === "production") {
      const remoteOrigin = req.get("Origin");
      if (
        config.allowedProductionOrigins.some((allowedOrigin) => allowedOrigin === remoteOrigin) ||
        (remoteOrigin &&
          remoteOrigin.match(/https:\/\/main-site-(.*)-effective-altruism-norway.vercel.app/)[0])
      ) {
        res.setHeader("Access-Control-Allow-Origin", remoteOrigin);
        res.setHeader("Vary", "Origin");
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, baggage, sentry-trace",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH,OPTIONS");
    next();
  });

  //Look for bearer tokens
  app.use(bearerToken());

  //Render engine for served views
  app.set("view engine", "mustache");
  app.set("layout", __dirname + "/views/layout.mustache");

  app.engine("mustache", hogan);

  //Server
  const mainServer = http.createServer(app);

  //Routes
  const donorsRoute = require("./routes/donors");
  const donationsRoute = require("./routes/donations").default;
  const distributionsRoute = require("./routes/distributions");
  const causeareasRoute = require("./routes/causeareas");
  const organizationsRoute = require("./routes/organizations");
  const reportsRoute = require("./routes/reports");
  const paypalRoute = require("./routes/paypal");
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

  app.use("/donors", donorsRoute);
  app.use("/donations", donationsRoute);
  app.use("/distributions", distributionsRoute);
  app.use("/causeareas", causeareasRoute);
  app.use("/organizations", organizationsRoute);
  app.use("/reports", reportsRoute);
  app.use("/paypal", paypalRoute);
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
  app.use("/tax", taxRoute);

  app.use("/static", express.static(__dirname + "/static"));
  app.use("/style", express.static(__dirname + "/views/style"));
  app.use("/img", express.static(__dirname + "/views/img"));

  //Error handling
  app.use(errorHandler);

  mainServer.listen(parseInt(config.port), config.host, () => {
    console.log("Main http server listening on http://" + config.host + ":" + config.port + " 📞");

    console.log("Don't Panic. 🐬");
    console.log("---");
  });
});
