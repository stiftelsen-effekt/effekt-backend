// Builds the Sanity studio into public/studio (served at /studio, see next.config.ts), reusing the
// previous build when nothing it is built from has changed: the files in studio/ and in the
// workspace packages it links (packages/config), the packages the lockfile resolves for the studio
// (not the rest of the lockfile: a dependency change elsewhere in the workspace keeps the cache),
// the studio's build-time environment and the Node version. The copy lives in .next/cache, which
// Vercel keeps between builds; most production builds are deploy hooks after a Sanity publish,
// with the same studio. A fresh build installs the studio's dependencies and takes about 35s on
// Vercel.
//
// The studio is a package of the pnpm workspace (effekt-studio). The website's install (Vercel's
// install command, web-checks.yml) leaves it out, so its dependencies are only installed here,
// when it is built.
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, files, lockfileClosure, reuseOrBuild } from "./build-cache.mjs";

const web = fileURLToPath(new URL(".", import.meta.url));
const repo = join(web, "..", "..");
const studio = join(web, "studio");
const output = join(web, "public", "studio");

const BUILD =
  "pnpm install --frozen-lockfile --filter effekt-studio && pnpm --dir studio run build ../public/studio -y";

// Generated or installed, not sources
const SKIP = new Set(["node_modules", "dist", ".sanity"]);

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

const dependencies = lockfileClosure(join(repo, "pnpm-lock.yaml"), "apps/web/studio");
const key = digest({
  strings: [BUILD, process.version, ...buildEnv(), ...dependencies.entries],
  paths: [studio, ...dependencies.links.map((link) => join(repo, link))].flatMap((dir) =>
    files(dir, SKIP),
  ),
  base: repo,
});

reuseOrBuild({
  label: "Studio build",
  cacheRoot: join(web, ".next", "cache", "studio"),
  key,
  output,
  marker: "index.html",
  // Names only (never values), to see why a build doesn't match the cached one
  describe: `; ${dependencies.entries.length} packages; env: ${buildEnv()
    .map((entry) => entry.split("=")[0])
    .join(", ")}`,
  build: () => {
    console.log("Building Sanity to public/studio");
    execSync(BUILD, { cwd: web, stdio: "inherit" });
  },
});
