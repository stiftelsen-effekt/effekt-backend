/**
 * Startup guard for PREVIEW_MODE. A preview hands out admin sessions to anyone with the URL, so
 * it must only ever run against a throwaway database on the previews Cloud SQL instance and with
 * every outbound integration unconfigured. Each rule below returns a violation; the server (and
 * the migrate/seed job) refuse to start when there is any.
 */
import { isIP } from "net";
import { PREVIEW_JWT_SECRET_MIN_LENGTH } from "./previewMode";

export const PREVIEW_DB_PREFIX = "preview_";
export const PREVIEW_SQL_INSTANCE = "effekt-previews";
export const PRODUCTION_SQL_INSTANCE = "effekt-db";
export const PREVIEW_RESOURCE_PREFIX = "effekt-preview-";

/**
 * Production secrets and integrations, from src/config.js (and the few modules that read
 * process.env directly). Any of them set in a preview means it could reach a real system:
 * charge or message real people, sync real lists, or accept real Auth0 tokens.
 */
export const FORBIDDEN_PREVIEW_SETTINGS: Record<string, string> = {
  // Vipps (payments, recurring agreements)
  VIPPS_CLIENT_ID: "Vipps",
  VIPPS_CLIENT_SECRET: "Vipps",
  VIPPS_OCP_APIM_SUBSCRIPTION_KEY: "Vipps",
  VIPPS_MERCHANT_SERIAL_NUMBER: "Vipps",
  VIPPS_RECURRING_WEBHOOK_SECRET: "Vipps",
  // MailerSend (receipts, notices, survey webhook)
  MAILERSEND_API_KEY: "MailerSend",
  MAILERSEND_SURVEY_WEBHOOK_SECRET: "MailerSend",
  MAILERSEND_SECURITY_RECIPIENTS: "MailerSend",
  // Mailchimp (newsletter sync)
  MAILCHIMP_API_KEY: "Mailchimp",
  MAILCHIMP_AUDIENCE_ID: "Mailchimp",
  MAILCHIMP_SERVER: "Mailchimp",
  // Nets (OCR / AvtaleGiro over SFTP)
  NETS_SFTP_SERVER: "Nets SFTP",
  NETS_SFTP_USER: "Nets SFTP",
  NETS_SFTP_PRIVATE_KEY: "Nets SFTP",
  NETS_SFTP_PRIVATE_KEY_LOCATION: "Nets SFTP",
  NETS_SFTP_PRIVATE_KEY_PASSPHRASE: "Nets SFTP",
  NETS_CUSTOMER_ID: "Nets",
  // Swish (production certificate switches to the live Swish API)
  SWISH_CERT: "Swish certificate",
  SWISH_CERT_KEY: "Swish certificate",
  // Auth0: M2M management client, MCP OAuth client, webhooks, and the tenant itself
  AUTH0_CLIENT_ID: "Auth0 M2M",
  AUTH0_CLIENT_SECRET: "Auth0 M2M",
  AUTH0_MCP_CLIENT_SECRET: "Auth0 MCP",
  AUTH0_LOG_STREAM_TOKEN: "Auth0 log stream",
  AUTH0_REGISTER_TOKEN: "Auth0 register hook",
  AUTH_BASE_URL: "Auth0 tenant",
  AUTH_ADDITIONAL_ISSUERS: "Auth0 tenant",
  // Analysis MCP (read-only analysis DB)
  MCP_SECRET: "Analysis MCP",
  MCP_DB_USER: "Analysis MCP",
  MCP_DB_PASS: "Analysis MCP",
  MCP_DB_NAME: "Analysis MCP",
  // Raw survey export
  SURVEY_EXPORT_SECRET: "Survey export",
  // Facebook donation sync (the app id variable is misspelled in config.js on purpose)
  FACBEOOK_SYNC_APP_ID: "Facebook sync",
  FACEBOOK_SYNC_APP_SECRET: "Facebook sync",
  // Tidbyt display worker
  TIDBYT_WORKER_URL: "Tidbyt",
  TIDBYT_WORKER_AUTH_TOKEN: "Tidbyt",
  // Next.js revalidation of the main site
  REVALIDATE_TOKEN: "Site revalidation",
  // Shared cache
  REDIS_URL: "Redis",
};

export type PreviewViolation = { rule: string; message: string };

const isSet = (value: string | undefined) => value !== undefined && value.trim() !== "";

const isPublicIPv4 = (host: string) => {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split(".").map(Number);
  const privateOrLocal =
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);
  return !privateOrLocal;
};

const sqlInstanceOf = (connectionName: string) => connectionName.split(":").pop() ?? "";

const parseDbUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      socket: parsed.searchParams.get("socket") ?? parsed.searchParams.get("socketPath") ?? "",
    };
  } catch {
    return undefined;
  }
};

const mentionsProductionInstance = (value: string) =>
  value.toLowerCase().includes(PRODUCTION_SQL_INSTANCE);

/** Every rule that is broken by this environment; empty when the preview may start. */
export const checkPreviewEnvironment = (env: NodeJS.ProcessEnv): PreviewViolation[] => {
  const violations: PreviewViolation[] = [];
  const fail = (rule: string, message: string) => violations.push({ rule, message });

  // Session signing secret
  const secret = env.PREVIEW_JWT_SECRET ?? "";
  if (secret.length < PREVIEW_JWT_SECRET_MIN_LENGTH) {
    fail(
      "jwt-secret",
      `PREVIEW_JWT_SECRET must be at least ${PREVIEW_JWT_SECRET_MIN_LENGTH} characters`,
    );
  }

  // Database name
  const dbName = env.DB_NAME ?? "";
  if (!dbName.startsWith(PREVIEW_DB_PREFIX)) {
    fail("db-name", `DB_NAME must start with "${PREVIEW_DB_PREFIX}" (got "${dbName}")`);
  }

  // Database instance / host
  const onCloudRun = isSet(env.K_SERVICE) || isSet(env.CLOUD_RUN_JOB);
  const connectionName = env.CLOUD_SQL_CONNECTION_NAME ?? "";
  if (isSet(connectionName)) {
    if (sqlInstanceOf(connectionName) !== PREVIEW_SQL_INSTANCE) {
      fail(
        "db-instance",
        `CLOUD_SQL_CONNECTION_NAME must point at the "${PREVIEW_SQL_INSTANCE}" instance (got "${connectionName}")`,
      );
    }
  } else if (onCloudRun) {
    fail(
      "db-instance",
      `On Cloud Run, CLOUD_SQL_CONNECTION_NAME must be set to the "${PREVIEW_SQL_INSTANCE}" instance`,
    );
  }

  const dbHost = env.DB_HOST ?? "";
  if (mentionsProductionInstance(dbHost)) {
    fail("db-host", `DB_HOST must not point at the production instance (got "${dbHost}")`);
  } else if (isPublicIPv4(dbHost)) {
    fail(
      "db-host",
      `DB_HOST must not be a public IP address (got "${dbHost}"); previews use the Cloud SQL socket`,
    );
  }

  const dbUrl = env.DB_URL ?? "";
  if (isSet(dbUrl)) {
    const parsed = parseDbUrl(dbUrl);
    if (!parsed) {
      fail("db-url", "DB_URL is not a valid URL");
    } else {
      if (!parsed.database.startsWith(PREVIEW_DB_PREFIX)) {
        fail("db-url", `DB_URL must name a "${PREVIEW_DB_PREFIX}*" database`);
      }
      if (parsed.database !== dbName) {
        fail("db-url", "DB_URL and DB_NAME must name the same database");
      }
      if (
        mentionsProductionInstance(parsed.host) ||
        mentionsProductionInstance(parsed.socket) ||
        isPublicIPv4(parsed.host)
      ) {
        fail("db-url", "DB_URL must not point at the production instance or a public IP address");
      }
      if (parsed.socket && sqlInstanceOf(parsed.socket) !== PREVIEW_SQL_INSTANCE) {
        fail("db-url", `DB_URL socket must be the "${PREVIEW_SQL_INSTANCE}" instance`);
      }
    }
  }

  // Production secrets and integrations
  for (const [name, integration] of Object.entries(FORBIDDEN_PREVIEW_SETTINGS)) {
    if (isSet(env[name])) {
      fail("integration", `${name} (${integration}) must not be set in a preview`);
    }
  }
  if (env.TIDBYT_PUSH_ENABLED === "true") {
    fail("integration", "TIDBYT_PUSH_ENABLED (Tidbyt) must not be on in a preview");
  }
  if (env.NODE_ENV === "production") {
    // NODE_ENV=production switches Vipps to its live API and turns on production behaviour.
    fail("node-env", 'NODE_ENV must not be "production" in a preview (use "preview")');
  }

  // Cloud Run resource names
  for (const name of ["K_SERVICE", "CLOUD_RUN_JOB"] as const) {
    const value = env[name];
    if (isSet(value) && !value!.startsWith(PREVIEW_RESOURCE_PREFIX)) {
      fail(
        "cloud-run-name",
        `${name} must start with "${PREVIEW_RESOURCE_PREFIX}" (got "${value}")`,
      );
    }
  }

  return violations;
};

export const formatViolations = (violations: PreviewViolation[]) =>
  [
    "PREVIEW_MODE is on, but this environment is not a safe preview. Refusing to start:",
    ...violations.map((v) => `  - [${v.rule}] ${v.message}`),
  ].join("\n");

/** Exits the process when PREVIEW_MODE is on and any rule is broken. */
export const enforcePreviewEnvironment = (
  env: NodeJS.ProcessEnv = process.env,
  exit: (code: number) => never = process.exit,
) => {
  const violations = checkPreviewEnvironment(env);
  if (violations.length > 0) {
    console.error(formatViolations(violations));
    exit(1);
  }
  console.log("Preview mode: environment checks passed");
};
