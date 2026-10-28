// Starts the Vite server Playwright uses, on this checkout's port (see dev-port.mjs), with the
// same env as the webServer in playwright.config.ts. Leave it running: `playwright test` reuses it
// outside CI, so repeated runs skip the Vite startup. Ctrl-C stops it.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { devPort } from "./dev-port.mjs";

const adminDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = devPort();
console.log(`pw:serve: http://localhost:${port}/design`);

const vite = spawn(
  join(adminDir, "node_modules", ".bin", "vite"),
  ["--port", String(port), "--strictPort"],
  {
    cwd: adminDir,
    stdio: "inherit",
    env: { ...process.env, VITE_AUTH_MODE: "dev", VITE_API_URL: "http://localhost:5999" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => vite.kill(signal));
}
vite.on("exit", (code) => process.exit(code ?? 0));
