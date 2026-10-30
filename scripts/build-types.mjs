// Emits the backend's tRPC declarations to dist-types/ for the admin's `@effekt/api` import.
//
// Incremental: with no backend change, tsc finds the build info up to date and writes nothing.
// A full rebuild happens only when the build info or the router declaration is missing (a fresh
// checkout, CI, or a deleted dist-types/). tsc never removes declarations of sources that were
// renamed or deleted, so those are swept afterwards: a stale .d.ts must not outlive its source.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmdirSync, rmSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "dist-types");
const buildInfo = join(out, "tsconfig.trpc.tsbuildinfo");
const routerDts = join(out, "trpc", "router.d.ts");

if (!existsSync(buildInfo) || !existsSync(routerDts)) {
  rmSync(out, { recursive: true, force: true });
}

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.trpc.json"], {
  cwd: root,
  stdio: "inherit",
});

function sweep(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sweep(path);
    } else if (entry.name.endsWith(".d.ts")) {
      const source = join(root, "src", relative(out, path).slice(0, -".d.ts".length) + ".ts");
      if (!existsSync(source)) unlinkSync(path);
    }
  }
  if (dir !== out && readdirSync(dir).length === 0) rmdirSync(dir);
}
if (existsSync(out)) sweep(out);

process.exit(result.status ?? 1);
