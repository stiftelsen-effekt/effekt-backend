// The dev-server port for this admin checkout. Derived from the directory path, so each worktree
// gets its own port in 4400-4999 without configuration and parallel runs never reach each other's
// server. PW_PORT overrides it.
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adminDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function devPort(env = process.env, dir = adminDir) {
  if (env.PW_PORT) return Number(env.PW_PORT);
  const hash = createHash("sha256").update(dir).digest().readUInt32BE(0);
  return 4400 + (hash % 600);
}
