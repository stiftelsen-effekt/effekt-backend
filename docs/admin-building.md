# Building admin pages

Entry point for feature work. [admin-design.md](admin-design.md) holds the rules; this file says what to read and how to work.

## What to read

| Task                                   | Read                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Any UI work                            | [admin-design.md](admin-design.md) › Page templates, Interaction patterns, Components  |
| Loading, placeholders, first load      | [admin-design.md](admin-design.md) › Loading                                           |
| Lists, filters, record panels          | [admin-design.md](admin-design.md) › Finding, List → detail, Data and filters          |
| Money, number or date display or entry | [admin-design.md](admin-design.md) › Money, numbers and dates                          |
| Mutations, confirmations, undo         | [admin-design.md](admin-design.md) › Editing, by risk; Optimism, undo and feedback     |
| Colours, type, spacing                 | [admin-design.md](admin-design.md) › Tokens                                            |
| Splits, allocations                    | [admin-design.md](admin-design.md) › Distributions                                     |
| Copy, errors, empty states             | [admin-design.md](admin-design.md) › Writing                                           |
| Keyboard, a11y                         | [admin-design.md](admin-design.md) › Keyboard, Accessibility commitments               |
| What exists already                    | [admin-features.md](admin-features.md); live demos in `apps/admin/src/routes/design/*` |
| Regranting (only then)                 | [regranting.md](regranting.md)                                                         |
| Backend tRPC procedures                | `apps/api/src/trpc/routers/`; conventions in `apps/api/src/trpc/schemas/common.ts`     |

## Rules

- **Real data only**: tRPC through TanStack Query (`trpc.<path>.queryOptions(...)` / `mutationOptions(...)`). Fake data stays in `/design`.
- **Loading**: `usePageQuery` for any query whose input follows the URL or local state; a `loader` with `loadPage` for pages reached from a list; first-load placeholders from the components, never hand-drawn skeletons.
- **Templates and components**: `ListPage`, `DetailPage`, `FlowPage`, `SettingsPage`, `RowDialog`, `defineList` / `useListState` / `FilterBar` / `DataTable`. If a generic component is missing, add it to `apps/admin/src/components` following [admin-design.md](admin-design.md) and show it on `/design/components`.
- **Lists**: URL-backed filters, sort and page, like the List demo. Register ⌘K search providers for your entities.
- **Record pages** open as panels over lists: add the route to `apps/admin/src/features/record-panels.ts`, read params with `useRecordParams(Route)`, search with `useRecordSearch(Route)`, and give list rows `getRowHref`.
- **Money**: API amounts are decimal strings. Format with `Money`; do arithmetic with `apps/admin/src/lib/money.ts`, never floats. Currency is NOK; numbers and dates use `nb-NO`.
- **Mutations**: follow the risk ladder in [admin-design.md](admin-design.md). Invalidate the right queries; show server validation (`error.data.fieldErrors`, `error.message`) next to the fields.
- **Country**: Gi Effektivt (Norway) only: Vipps and AvtaleGiro agreements, NOK. No Swedish features, no locale switch. Procedures that take a `locale` default to NO; omit it.
- **Copy**: English, following `apps/admin/src/lib/strings.ts`.
- **Accessibility**: internal tool. Keyboard use matters (shortcuts, focus order, Esc, Enter to submit); cover it in interaction tests. Semantic elements and labels by default; no screen-reader polish or axe chasing.
- **Tests**: Vitest for non-trivial logic (mappers, form → input transforms). Screenshot tests only for new reusable components.
- If a page needs data no procedure provides, don't fake it. Add the procedure or note the gap.

## Running against real data

```sh
pnpm dev:env:up          # repo root: MySQL + seeded data, mock OIDC, API on :5050, admin on :3001
pnpm -s dev:token        # admin token for curl
```

The admin container hot-reloads from your checkout. To run the admin on the host instead:
`cd admin && VITE_AUTH_MODE=dev VITE_API_URL=http://localhost:5050 pnpm dev --port 5200`.

Check every page and action in a browser against seeded data, in both themes. Mutations against the local DB are fine.

## Testing while you work

Run the gate once, at the end. When you're done editing, start it in the background, write your report while it runs,
and if it fails, fix the problem and re-run only what failed:

```sh
pnpm gate                               # in apps/admin: typecheck, Vitest, interaction + visual, Auth0 prod-build smoke (background it)
pnpm exec playwright test --last-failed # after a failure: only the tests that failed
```

The axe scans (`pnpm test:a11y`, about two minutes) aren't in the gate. Run them only when you change a shared component's markup.

Typecheck is incremental: with no change, a repeat `pnpm typecheck` takes about a second.

Each checkout has its own dev-server port (4400–4999, derived from the directory; `PW_PORT` overrides). Playwright
starts a server if none is running. For repeated runs, start it once with `pnpm pw:serve`; Playwright reuses it (outside CI).

While iterating, run only what your change touches:

- `pnpm exec vitest run src/lib/money` (in `apps/admin/`): one area's unit tests (about 2 s).
- `pnpm exec playwright test tests/interaction/donors.spec.ts` or `--grep "review queue"`: one spec. Pass several projects
  to one `playwright test` call, not one call per project; without `pw:serve`, each call starts its own Vite server.
- `pnpm exec playwright test --only-changed=<base branch>`: specs whose files (or imports) changed since the branch point.
- Playwright already runs files in parallel. Several agents test at once, so don't raise `--workers`.
- Backend: `pnpm test src/__test__/<file>.spec.ts` (or a part of the name) in `apps/api/`: one spec file (Vitest).

Don't pipe a long run through `tail`: output arrives only when the run ends, so a hang looks like slowness. Re-run a
failing test on its own before assuming flakiness.

## Package manager

pnpm workspace (backend in `apps/api/`, admin in `apps/admin/`). Use `pnpm` only: `npm install` would copy `node_modules` per checkout.
