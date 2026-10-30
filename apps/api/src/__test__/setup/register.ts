/**
 * Runs in every test worker before the spec (see vitest.config.ts): loads the test environment
 * and lets Node `require` TypeScript, as `mocha --require dotenv/config --require ts-node/register`
 * did.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.test" });
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("ts-node").register({ transpileOnly: true });
