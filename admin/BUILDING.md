# Building admin pages

How to add a feature page. The design decisions are made — `DESIGN.md` is the rulebook; this file
is the workflow. Read, in order: `DESIGN.md`, `FEATURES.md`, the template demos in
`src/routes/design/*`, and the procedures you'll call in `../src/trpc/routers/*.ts`.

## Rules

- **Real data only**: tRPC through TanStack Query (`trpc.<path>.queryOptions(...)` /
  `mutationOptions(...)`). Fake data stays in `/design`.
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

`pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:a11y` and `pnpm test:interaction` must pass in `admin/`.

## Package manager

The repo is a pnpm workspace (backend at the root, admin in `admin/`); packages are hard-linked
from pnpm's global store. Use `pnpm` only — `npm install` would create a full copy of
`node_modules` per checkout.
