// `pnpm types:api`: the API's tRPC declarations in apps/api/dist-types (`pnpm build:types`, see
// docs/web-trpc.md), which `next build` and `tsc` need to type the website's tRPC client. They take
// about 11s on Vercel, so the output is kept in .next/cache and reused while nothing it is built
// from has changed: the API's sources, Prisma schema and TypeScript settings, the workspace
// packages it links, the packages the lockfile resolves for the API, and the Node version.
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, files, lockfileClosure, reuseOrBuild } from "./build-cache.mjs";

const web = fileURLToPath(new URL(".", import.meta.url));
const repo = join(web, "..", "..");
const api = join(repo, "apps", "api");

const BUILD = "pnpm --dir ../api build:types";

const dependencies = lockfileClosure(join(repo, "pnpm-lock.yaml"), "apps/api");
const key = digest({
  strings: [BUILD, process.version, ...dependencies.entries],
  paths: [
    ...files(join(api, "src")),
    ...["package.json", "tsconfig.json", "tsconfig.trpc.json", "prisma/schema.prisma"].map((name) =>
      join(api, name),
    ),
    join(api, "scripts", "build-types.mjs"),
    ...dependencies.links.flatMap((link) => files(join(repo, link), new Set(["node_modules"]))),
  ],
  base: repo,
});

reuseOrBuild({
  label: "API types",
  cacheRoot: join(web, ".next", "cache", "api-types"),
  key,
  output: join(api, "dist-types"),
  marker: join("trpc", "router.d.ts"),
  build: () => execSync(BUILD, { cwd: web, stdio: "inherit" }),
});
