import { expect } from "chai";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import {
  checkPreviewEnvironment,
  enforcePreviewEnvironment,
  FORBIDDEN_PREVIEW_SETTINGS,
} from "../custom_modules/preview/environmentGuard";
import { databaseUrl, run as runDatabaseCli } from "../custom_modules/preview/databaseCli";
import {
  createPreviewJwtCheck,
  isPreviewMode,
  previewUsers,
  selectJwtCheck,
  signPreviewToken,
} from "../custom_modules/preview/previewMode";
import { noIndex, previewAdmin } from "../custom_modules/preview/previewHttp";
import { createPreviewRouter } from "../routes/preview";

const SECRET = "x".repeat(48);
const CONNECTION = "hidden-display-243419:europe-north1:effekt-previews";

/** A preview environment as the pipeline sets it on Cloud Run: passes every rule. */
const validEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  PREVIEW_MODE: "true",
  PREVIEW_JWT_SECRET: SECRET,
  NODE_ENV: "preview",
  DB_NAME: "preview_pr_12",
  DB_USER: "preview",
  DB_PASS: "synthetic-only",
  CLOUD_SQL_CONNECTION_NAME: CONNECTION,
  K_SERVICE: "effekt-preview-pr-12",
  ...overrides,
});

const rules = (env: NodeJS.ProcessEnv) => checkPreviewEnvironment(env).map((v) => v.rule);

describe("Preview environment guard", function () {
  it("accepts a correctly configured preview (Cloud Run service)", function () {
    expect(checkPreviewEnvironment(validEnv())).to.deep.equal([]);
  });

  it("accepts the migrate/seed job and a local throwaway database", function () {
    expect(
      rules(validEnv({ K_SERVICE: undefined, CLOUD_RUN_JOB: "effekt-preview-seed-pr-12" })),
    ).to.deep.equal([]);
    expect(
      rules(
        validEnv({
          K_SERVICE: undefined,
          CLOUD_SQL_CONNECTION_NAME: undefined,
          DB_HOST: "preview-mysql",
          DB_URL: "mysql://root:pw@preview-mysql:3306/preview_pr_0",
          DB_NAME: "preview_pr_0",
        }),
      ),
    ).to.deep.equal([]);
  });

  describe("session secret", function () {
    it("refuses a missing PREVIEW_JWT_SECRET", function () {
      expect(rules(validEnv({ PREVIEW_JWT_SECRET: undefined }))).to.deep.equal(["jwt-secret"]);
    });
    it("refuses a short PREVIEW_JWT_SECRET", function () {
      expect(rules(validEnv({ PREVIEW_JWT_SECRET: "short" }))).to.deep.equal(["jwt-secret"]);
    });
  });

  describe("database name", function () {
    it("refuses a database not starting with preview_", function () {
      expect(rules(validEnv({ DB_NAME: "EffektDonasjonDB" }))).to.deep.equal(["db-name"]);
    });
    it("refuses a missing database name", function () {
      expect(rules(validEnv({ DB_NAME: undefined }))).to.deep.equal(["db-name"]);
    });
  });

  describe("database instance", function () {
    it("refuses the production Cloud SQL instance", function () {
      expect(
        rules(
          validEnv({ CLOUD_SQL_CONNECTION_NAME: "hidden-display-243419:europe-north1:effekt-db" }),
        ),
      ).to.deep.equal(["db-instance"]);
    });
    it("refuses any instance other than effekt-previews", function () {
      expect(
        rules(validEnv({ CLOUD_SQL_CONNECTION_NAME: "other-project:europe-north1:something" })),
      ).to.deep.equal(["db-instance"]);
    });
    it("requires a connection name on Cloud Run", function () {
      expect(rules(validEnv({ CLOUD_SQL_CONNECTION_NAME: undefined }))).to.deep.equal([
        "db-instance",
      ]);
      expect(
        rules(
          validEnv({
            K_SERVICE: undefined,
            CLOUD_RUN_JOB: "effekt-preview-seed-pr-12",
            CLOUD_SQL_CONNECTION_NAME: "",
          }),
        ),
      ).to.deep.equal(["db-instance"]);
    });
    it("refuses a DB_HOST naming the production instance", function () {
      expect(rules(validEnv({ DB_HOST: "effekt-db.internal" }))).to.deep.equal(["db-host"]);
    });
    it("refuses a public IP DB_HOST but allows private and loopback addresses", function () {
      expect(rules(validEnv({ DB_HOST: "35.228.1.2" }))).to.deep.equal(["db-host"]);
      for (const host of ["127.0.0.1", "10.0.0.5", "172.17.0.2", "192.168.1.9", "localhost"]) {
        expect(rules(validEnv({ DB_HOST: host })), host).to.deep.equal([]);
      }
    });
    it("checks DB_URL: database, host, socket", function () {
      const url = (rest: string) => validEnv({ DB_URL: `mysql://u:p@${rest}` });
      expect(rules(url("localhost/preview_pr_12?socket=/cloudsql/" + CONNECTION))).to.deep.equal(
        [],
      );
      expect(rules(url("localhost/EffektDonasjonDB"))).to.include("db-url");
      expect(rules(url("localhost/preview_pr_99"))).to.deep.equal(["db-url"]);
      expect(rules(url("35.228.1.2/preview_pr_12"))).to.deep.equal(["db-url"]);
      expect(
        rules(url("localhost/preview_pr_12?socket=/cloudsql/p:europe-north1:effekt-db")),
      ).to.include("db-url");
      expect(rules(validEnv({ DB_URL: "not a url" }))).to.deep.equal(["db-url"]);
    });
  });

  describe("production integrations", function () {
    for (const [name, integration] of Object.entries(FORBIDDEN_PREVIEW_SETTINGS)) {
      it(`refuses ${name} (${integration})`, function () {
        const violations = checkPreviewEnvironment(validEnv({ [name]: "configured" }));
        expect(violations.map((v) => v.rule)).to.deep.equal(["integration"]);
        expect(violations[0].message).to.contain(name);
      });
    }
    it("ignores integrations that are set but blank", function () {
      expect(rules(validEnv({ VIPPS_CLIENT_ID: "", MAILERSEND_API_KEY: "  " }))).to.deep.equal([]);
    });
    it("refuses Tidbyt push", function () {
      expect(rules(validEnv({ TIDBYT_PUSH_ENABLED: "true" }))).to.deep.equal(["integration"]);
    });
    it("covers the integrations named in the preview requirements", function () {
      const covered = new Set(Object.values(FORBIDDEN_PREVIEW_SETTINGS));
      for (const integration of [
        "Vipps",
        "MailerSend",
        "Mailchimp",
        "Nets SFTP",
        "Swish certificate",
        "Auth0 M2M",
        "Auth0 MCP",
        "Survey export",
        "Facebook sync",
      ]) {
        expect(covered.has(integration), integration).to.equal(true);
      }
    });
  });

  it("refuses NODE_ENV=production", function () {
    expect(rules(validEnv({ NODE_ENV: "production" }))).to.deep.equal(["node-env"]);
  });

  describe("Cloud Run names", function () {
    it("refuses a service not named effekt-preview-*", function () {
      expect(rules(validEnv({ K_SERVICE: "effektapi" }))).to.deep.equal(["cloud-run-name"]);
    });
    it("refuses a job not named effekt-preview-*", function () {
      expect(
        rules(validEnv({ K_SERVICE: undefined, CLOUD_RUN_JOB: "effektapi-db-migrate" })),
      ).to.deep.equal(["cloud-run-name"]);
    });
  });

  it("reports every broken rule of a production-looking environment and exits", function () {
    const production = {
      PREVIEW_MODE: "true",
      NODE_ENV: "production",
      DB_NAME: "EffektDonasjonDB",
      CLOUD_SQL_CONNECTION_NAME: "hidden-display-243419:europe-north1:effekt-db",
      K_SERVICE: "effektapi",
      VIPPS_CLIENT_SECRET: "real",
      MAILERSEND_API_KEY: "real",
      AUTH_BASE_URL: "https://gieffektivt.eu.auth0.com/",
    };
    expect(new Set(rules(production))).to.deep.equal(
      new Set([
        "jwt-secret",
        "db-name",
        "db-instance",
        "integration",
        "node-env",
        "cloud-run-name",
      ]),
    );
    let exitCode: number | undefined;
    const originalError = console.error;
    console.error = () => undefined;
    try {
      enforcePreviewEnvironment(production, ((code: number) => {
        exitCode = code;
        throw new Error("exit");
      }) as (code: number) => never);
    } catch {
      // the fake exit throws to stop execution like process.exit would
    } finally {
      console.error = originalError;
    }
    expect(exitCode).to.equal(1);
  });
});

describe("Preview mode switch", function () {
  it("is on only for PREVIEW_MODE=true exactly", function () {
    expect(isPreviewMode({ PREVIEW_MODE: "true" })).to.equal(true);
    for (const value of [undefined, "", "1", "TRUE", "yes", "false"]) {
      expect(isPreviewMode({ PREVIEW_MODE: value }), String(value)).to.equal(false);
    }
  });

  it("uses the production check unless preview mode is on", function () {
    const production: express.RequestHandler = (_req, _res, next) => next();
    expect(selectJwtCheck(() => production, {})).to.equal(production);
    expect(selectJwtCheck(() => production, { PREVIEW_MODE: "false" })).to.equal(production);
    expect(selectJwtCheck(() => production, { PREVIEW_MODE: "true" })).to.not.equal(production);
  });
});

describe("Preview sessions", function () {
  const appWith = (secret: string | undefined) => {
    const app = express();
    app.use(express.json());
    app.use("/preview", createPreviewRouter({ PREVIEW_JWT_SECRET: secret, PREVIEW_PR: "12" }));
    app.get(
      "/protected",
      createPreviewJwtCheck(() => secret),
      (req, res) => {
        res.json({ payload: req.auth?.payload });
      },
    );
    app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
    return app;
  };

  it("issues an admin token for each preview user that the preview check accepts", async function () {
    const app = appWith(SECRET);
    for (const user of previewUsers) {
      const session = await request(app).post("/preview/session").send({ as: user.id });
      expect(session.status).to.equal(200);
      expect(session.headers["cache-control"]).to.equal("no-store");
      const protectedRes = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${session.body.accessToken}`);
      expect(protectedRes.status).to.equal(200);
      expect(protectedRes.body.payload.email).to.equal(user.email);
      expect(protectedRes.body.payload.permissions).to.include("admin");
      expect(protectedRes.body.payload.permissions).to.not.include("analysis_mcp");
    }
  });

  it("rejects unknown users", async function () {
    const res = await request(appWith(SECRET)).post("/preview/session").send({ as: "root" });
    expect(res.status).to.equal(400);
  });

  it("rejects tokens signed with another secret, expired tokens and alg=none", async function () {
    const app = appWith(SECRET);
    const other = signPreviewToken(previewUsers[0], "y".repeat(48)).accessToken;
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${other}`)).status,
    ).to.equal(401);

    const expired = signPreviewToken(previewUsers[0], SECRET, 1_000_000).accessToken;
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${expired}`)).status,
    ).to.equal(401);

    const [, payload] = signPreviewToken(previewUsers[0], SECRET).accessToken.split(".");
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${payload}.`;
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${none}`)).status,
    ).to.equal(401);
  });

  it("does not accept anything without a secret", async function () {
    const app = appWith(undefined);
    expect(() => signPreviewToken(previewUsers[0], undefined)).to.throw(/PREVIEW_JWT_SECRET/);
    const token = signPreviewToken(previewUsers[0], SECRET).accessToken;
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).to.not.equal(200);
  });

  it("describes the preview for the banner", async function () {
    const res = await request(appWith(SECRET)).get("/preview/info");
    expect(res.body.pr).to.equal("12");
    expect(res.body.users.map((u) => u.email)).to.deep.equal([
      "ops@example.org",
      "finance@example.org",
      "approver@example.org",
    ]);
  });
});

describe("Preview HTTP", function () {
  let adminDir: string;

  before(function () {
    adminDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-admin-"));
    fs.mkdirSync(path.join(adminDir, "assets"));
    fs.writeFileSync(path.join(adminDir, "index.html"), "<html>admin</html>");
    fs.writeFileSync(path.join(adminDir, "assets", "app-abc.js"), "console.log(1)");
  });

  after(function () {
    fs.rmSync(adminDir, { recursive: true, force: true });
  });

  const app = () => {
    const a = express();
    a.use(noIndex);
    a.use(previewAdmin(adminDir)!);
    a.get("/donors/:id", (_req, res) => res.json({ api: true }));
    a.use((_req, res) => res.status(404).json({ status: 404 }));
    return a;
  };

  it("sets X-Robots-Tag on every response", async function () {
    const res = await request(app()).get("/nothing-here");
    expect(res.headers["x-robots-tag"]).to.equal("noindex, nofollow");
  });

  it("serves the admin to browser navigations and the API to API calls", async function () {
    const page = await request(app()).get("/donors/12").set("Accept", "text/html");
    expect(page.text).to.contain("admin");
    expect(page.headers["cache-control"]).to.equal("no-cache");
    const api = await request(app()).get("/donors/12").set("Accept", "application/json");
    expect(api.body).to.deep.equal({ api: true });
    const asset = await request(app()).get("/assets/app-abc.js");
    expect(asset.headers["cache-control"]).to.contain("immutable");
    const docs = await request(app()).get("/api-docs/").set("Accept", "text/html");
    expect(docs.status).to.equal(404);
  });

  it("is off without a built admin", function () {
    expect(previewAdmin(undefined)).to.equal(undefined);
    expect(previewAdmin(path.join(adminDir, "missing"))).to.equal(undefined);
  });
});

describe("Preview database commands", function () {
  it("build socket URLs for Prisma and mysql2", function () {
    const env = validEnv({ DB_PASS: "p@ss/word" });
    expect(databaseUrl(env, "prisma")).to.equal(
      `mysql://preview:p%40ss%2Fword@localhost/preview_pr_12?socket=/cloudsql/${CONNECTION}`,
    );
    expect(databaseUrl(env, "mysql2")).to.contain(`?socketPath=/cloudsql/${CONNECTION}`);
  });

  it("refuse to run outside a valid preview environment", async function () {
    for (const env of [
      validEnv({ PREVIEW_MODE: undefined }),
      validEnv({ DB_NAME: "EffektDonasjonDB" }),
      validEnv({ DB_NAME: "preview_x`; DROP DATABASE prod; --" }),
      validEnv({ CLOUD_SQL_CONNECTION_NAME: "p:europe-north1:effekt-db" }),
    ]) {
      let error: unknown;
      try {
        await runDatabaseCli(["drop"], env);
      } catch (err) {
        error = err;
      }
      expect(error, env.DB_NAME).to.be.instanceOf(Error);
    }
  });
});
