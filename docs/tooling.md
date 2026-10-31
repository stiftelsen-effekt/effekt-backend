# Tooling

One set of tools and script names for every package in the workspace.

## Commands

Every app has the same scripts, and the root runs each one across the workspace:

| Script              | Root (whole workspace)                                       | In a package            |
| ------------------- | ------------------------------------------------------------ | ----------------------- |
| `pnpm lint`         | every package's `lint`                                       | the package's linter    |
| `pnpm typecheck`    | builds the tRPC types once, then every package's `typecheck` | `tsc --noEmit`          |
| `pnpm test`         | every package's `test`                                       | Vitest                  |
| `pnpm build`        | every package's `build` (the website needs its env, below)   | the package's bundler   |
| `pnpm format`       | Prettier on the whole repository                             | Prettier on the package |
| `pnpm format:check` | the same, without writing (Cloud Build QA runs this)         | the same                |

Run one app's script from the root with `pnpm <app>:<script>` (`api:test`, `admin:typecheck`,
`web:build`, ...), or with `pnpm <script>` in the app's folder. `pnpm dev` and `pnpm start` at
the root still start the API.

`pnpm build` at the root includes `next build`, which prerenders pages from Sanity and the API.
Locally, set the website's public variables first, for example those in
[`scripts/e2e-fullstack.sh`](../scripts/e2e-fullstack.sh) with `NEXT_PUBLIC_EFFEKT_API` pointing
at an API that is running.

## Versions

Versions that more than one package uses live in the `catalog` in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml); the packages say `"catalog:"`. To upgrade
React, TypeScript, Vitest, tRPC, zod and so on, change the catalog and run `pnpm install`.

TypeScript comes in two versions. The API and the website stay on TypeScript 5.9, because
ts-node, the API's spec transform, `next build` and the tRPC type build use TypeScript's
JavaScript API, which TypeScript 7 doesn't have yet. The admin and the Sanity Studio only run
`tsc`, so they use TypeScript 7 (the native compiler, about ten times faster) from the
`native` catalog. Move the rest when TypeScript 7 ships its API.

Node is pinned once, in [`.nvmrc`](../.nvmrc), and `engines.node` is `24.x` everywhere. pnpm is
pinned by `packageManager` in the root `package.json`.

## Tools

| Concern         | Tool                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Package manager | pnpm (one workspace, one lockfile)                                                                  |
| Format          | Prettier 3, one config ([`.prettierrc`](../.prettierrc))                                            |
| Test            | Vitest                                                                                              |
| TypeScript      | [`@effekt/config/tsconfig.base.json`](../packages/config/tsconfig.base.json), extended by every app |
| Bundlers        | API: `tsc`. Admin: Vite. Website: Next.js. Studio: the Sanity CLI (Vite)                            |

### Why not Vite+ (October 2026)

[Vite+](https://viteplus.dev) (`vite-plus`, from VoidZero) bundles Vite, Vitest, Oxlint, Oxfmt,
tsdown and a task runner behind one `vp` command. It is MIT licensed and reached 1.0 in
September 2026. We don't adopt it yet:

- It is built around `vite.config.ts` as the one config and `vite-plus` replacing the `vite` and
  `vitest` imports. Two of our four apps don't build with Vite: the website is Next.js and the
  API is `tsc`, with a custom Vitest transform for its CommonJS specs. We would get the linter,
  formatter and test runner through a wrapper whose versions are tied to the `vite-plus`
  release, and no bundler gain.
- Its task runner caches, but pnpm's `-r` scripts are enough for four apps. Our slow steps (the
  website's prerender, the API's database tests) don't benefit from a task cache.
- 1.0 is a month old and VoidZero calls it "far from feature-complete"; the migration rewrites
  dependencies, imports and config across the repository.

We use its parts that stand on their own instead, where they are mature: Vitest everywhere.
Revisit Vite+ if the website ever moves off Next.js, or once it has been stable for a while.

## Before (October 2026)

What each package used before the tooling was standardized:

| Package           | Package manager     | Lint                             | Test          | TypeScript | Scripts missing         |
| ----------------- | ------------------- | -------------------------------- | ------------- | ---------- | ----------------------- |
| `apps/api`        | pnpm                | none                             | Vitest        | 5.9        | lint, format            |
| `apps/admin`      | pnpm                | none                             | Vitest        | 7.0        | lint, format            |
| `apps/web`        | pnpm                | ESLint 10 (`eslint-config-next`) | Vitest        | 5.9        | format                  |
| `apps/web/studio` | npm (own lockfile)  | ESLint 8 config, never run       | none          | 7.0        | lint, test, format      |
| `functions/*`     | npm (own lockfiles) | none                             | `node --test` | (plain JS) | lint, typecheck, format |

Shared versions were written separately in each package (exact in the admin, `^` elsewhere),
and the root `test`, `typecheck` and `build` ran the API's only.
