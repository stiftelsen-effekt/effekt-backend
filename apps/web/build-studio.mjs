// Builds the Sanity studio into public/studio (served at /studio, see next.config.ts), reusing the
// previous build when nothing it is built from has changed: the files in studio/, the studio's
// build-time environment and the Node version. The copy lives in .next/cache, which Vercel keeps
// between builds; most production builds are deploy hooks after a Sanity publish, with the same
// studio. A fresh build installs the studio's dependencies and takes about 35s on Vercel.
//
// The studio is a package of the pnpm workspace (effekt-studio). The website's install (Vercel's
// install command, web-checks.yml) leaves it out, so its dependencies are only installed here,
// when it is built.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL(".", import.meta.url));
const studio = join(web, "studio");
const output = join(web, "public", "studio");
const cacheRoot = join(web, ".next", "cache", "studio");

const BUILD =
  "pnpm install --frozen-lockfile --filter effekt-studio && pnpm --dir studio run build ../public/studio -y";
// The studio's dependency versions live in the workspace lockfile and catalog
const repo = join(web, "..", "..");
const lockfiles = [join(repo, "pnpm-lock.yaml"), join(repo, "pnpm-workspace.yaml")];

// Generated or installed, not sources
const SKIP = new Set(["node_modules", "dist", ".sanity"]);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !SKIP.has(entry.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return files(path);
      return entry.isFile() ? [path] : [];
    })
    .sort();
}

// What studio/sanity.cli.ts and the studio code read at build time. VERCEL_URL only matters on
// previews (sanity.config.ts); leaving it out elsewhere is what lets production builds match.
function buildEnv() {
  const preview = process.env.VERCEL_ENV !== "production";
  const names = Object.keys(process.env)
    .filter(
      (name) =>
        name.startsWith("SANITY_STUDIO_") ||
        name.startsWith("NEXT_PUBLIC_SANITY_STUDIO_") ||
        ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL"].includes(name),
    )
    .filter((name) => preview || !["VERCEL_URL", "SANITY_STUDIO_VERCEL_URL"].includes(name))
    .sort();
  return names.map((name) => `${name}=${process.env[name]}`);
}

const hash = createHash("sha256");
hash.update(`${BUILD}\n${process.version}\n`);
for (const entry of buildEnv()) hash.update(`${entry}\n`);
for (const path of [...lockfiles, ...files(studio)]) {
  hash.update(`${relative(studio, path)}\n`);
  hash.update(readFileSync(path));
}
const key = hash.digest("hex").slice(0, 32);
const cached = join(cacheRoot, key);

if (existsSync(join(cached, "index.html"))) {
  rmSync(output, { recursive: true, force: true });
  cpSync(cached, output, { recursive: true });
  console.log(`Sanity studio unchanged, reused the build in .next/cache/studio/${key}`);
} else {
  console.log("Building Sanity to public/studio");
  execSync(BUILD, { cwd: web, stdio: "inherit" });
  // Keep only the latest build
  rmSync(cacheRoot, { recursive: true, force: true });
  cpSync(output, cached, { recursive: true });
  console.log("Done");
}
