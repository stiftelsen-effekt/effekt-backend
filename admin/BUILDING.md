# Building admin pages

How to add a feature page. The design decisions are made — `DESIGN.md` is the rulebook; this file
is the workflow. Read, in order: `DESIGN.md`, `FEATURES.md`, the template demos in
`src/routes/design/*`, and the procedures you'll call in `../src/trpc/routers/*.ts`.

## Rules

- **Real data only**: tRPC through TanStack Query (`trpc.<path>.queryOptions(...)` /
  `mutationOptions(...)`). Fake data stays in `/design`.
- **Loading** (DESIGN.md › Loading): `usePageQuery` for any query whose input follows the URL or
  local state; a `loader` with `loadPage` for pages reached from a list; first-load
  placeholders from the components (`DataTable isLoading`, `Stat pending`, `Property pending`,
  `SkeletonText`), never hand-drawn skeleton layouts.
- **Templates and components**: `ListPage`, `DetailPage`, `FlowPage`, `SettingsPage`, `PeekPanel`,
  `defineList` / `useListState` / `FilterBar` / `DataTable`. If a generic component is genuinely
  missing, add it to `src/components` following DESIGN.md and show it on `/design/components`.
- **Lists**: URL-backed filters, sort and page, exactly like the List demo. Register ⌘K search
  providers for your entities.
- **Money**: API amounts are decimal strings. Format with `Money`; do arithmetic with
  `src/lib/money.ts`, never floats. Currency is NOK; numbers and dates use `nb-NO`.
- **Mutations**: follow DESIGN.md's risk ladder (inline edit for low-risk fields, explicit save for
  forms, before → after confirmation for money, typed confirmation for irreversible). Invalidate
  the right queries; show server validation (`error.data.fieldErrors`, `error.message`) next to the
  fields.
- **Country**: the admin serves Gi Effektivt (Norway) only: Vipps and AvtaleGiro agreements, NOK.
  No Swedish features and no locale switch. Procedures that take a `locale` default to NO — omit
  it.
- **Copy**: English, following `src/lib/strings.ts` conventions.
- **Accessibility**: keyboard flows as in the demos; add new routes to the axe test list.
- **Tests**: Vitest for non-trivial logic (mappers, form → input transforms). Screenshot tests only
  for new reusable components.
- If a page needs data no procedure provides, don't fake it — add the procedure (backend
  conventions: `docs/overhaul-plan.md`, `src/trpc/schemas/common.ts`) or note the gap.

## Running against real data

```sh
pnpm dev:env:up          # repo root: MySQL + seeded data, mock OIDC, API on :5050, admin on :3001
pnpm -s dev:token        # admin token for curl
```

The admin container hot-reloads from your checkout. To run the admin on the host instead:
`cd admin && VITE_AUTH_MODE=dev VITE_API_URL=http://localhost:5050 pnpm dev --port 5200`.

Check every page and action in a browser against seeded data, in both themes. Mutations against the
local database are fine.

## Testing while you work

The full gate takes about four minutes, so run it once, at the end, not after every change:

```sh
pnpm gate     # in admin/: typecheck, build, Vitest, then all Playwright projects in one run
```

While iterating, run only what your change touches:

- `pnpm exec vitest run src/lib/money` — the unit tests for one area (about 2 s).
- `pnpm exec playwright test tests/interaction/donors.spec.ts` or `--grep "review queue"` — one
  spec, not a whole project. Pass several projects to one `playwright test` call rather than one
  call per project: each call starts its own Vite server.
- `pnpm exec playwright test --only-changed=<base branch>` — the specs whose files (or imports)
  changed since the branch point.
- Backend: `pnpm test:file src/__test__/<file>.spec.ts` from the repo root runs one spec. A path
  passed to `pnpm test` is added to the spec glob in `.mocharc.json`, so the whole suite runs.

Don't pipe a long run through `tail`: the output only arrives when the run ends, so a hang
looks like slowness. Re-run a failing test on its own before assuming flakiness.

## Package manager

The repo is a pnpm workspace (backend at the root, admin in `admin/`); packages are hard-linked
from pnpm's global store. Use `pnpm` only — `npm install` would create a full copy of
`node_modules` per checkout.
