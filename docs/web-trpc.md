# tRPC on the website (apps/web)

The website's Min Side is moving from hand-written REST calls (`_queries.ts`) to the backend's
tRPC router, one call at a time. Migrated so far, all read-only:

| Procedure                     | Formerly                                | Hook                                             |
| ----------------------------- | --------------------------------------- | ------------------------------------------------ |
| `minside.profile`             | `GET /donors/:id`                       | `useDonor` (`DonorProvider`)                     |
| `minside.taxUnits`            | `GET /donors/:id/taxunits`              | `useTaxUnits`                                    |
| `minside.donationsAggregated` | `GET /donors/:id/donations/aggregated`  | `useAggregatedDonations`                         |
| `minside.donations`           | `GET /donors/:id/donations`             | `useDonations`                                   |
| `minside.distributions`       | `GET /donors/:id/distributions/?kids=…` | `useDistributions`, `useAgreementsDistributions` |

SWR keys are in `minsideKeys` (`_queries.ts`); revalidate with `mutate(minsideKeys.taxUnits(id))`.

## Pieces

| Piece                                 | Where                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Donor-facing procedures               | `src/trpc/routers/minside.ts` (mounted as `minside` in `src/trpc/router.ts`) |
| `donorProcedure(permission, input?)`  | `src/trpc/trpc.ts`                                                           |
| Schemas shared with the web (runtime) | `src/trpc/shared/minside.ts` (may only import `zod`)                         |
| `@effekt/api` workspace package       | `packages/api`: `AppRouter` type + `@effekt/api/minside` schemas             |
| Web client and links                  | `apps/web/lib/trpc/` (`client.ts`, `restLink.ts`, `useTrpcClient.ts`)        |

### Auth

`donorProcedure(permission)` mirrors the REST donor routes
(`authMiddleware.auth(permission)` + `checkAdminOrTheDonor(id)`): the Auth0 token is verified by
the same validator, must carry `permission`, and its user id claim (`AUTH_USER_ID_CLAIM`) must
equal `input.donorId` unless the token has the `admin` permission. `donorId` is a positive integer,
like the REST routes' `:id` param. Errors: no or invalid token is `UNAUTHORIZED` (401); a missing
permission or another donor's id is `FORBIDDEN` (403; REST answers 401 for both).

### Types

`pnpm build:types` (root) emits the router's declarations to `dist-types/`, as for the admin.
`packages/api/index.d.ts` re-exports `AppRouter` from there, and apps/web has `@effekt/api` as a
workspace dev dependency. apps/web runs the type build itself: `pnpm typecheck` and `pnpm build`
both start with `pnpm types:api`. This works on Vercel because its install
(`pnpm install --frozen-lockfile --filter main-site`) also installs the workspace root's
dependencies and runs its `postinstall` (`prisma generate`), which is all `build:types` needs.
Nothing generated is committed.

The output schemas are needed at runtime on the web (see the Danish site below), so they live in
`src/trpc/shared/` and are bundled into the web through `@effekt/api/minside` (listed in
`transpilePackages`). A backend test fails if that folder imports anything but `zod`.

### Client

Min Side keeps SWR. `useTrpcClient(getAccessTokenSilently)` returns a plain `@trpc/client`
client, and a query hook calls it from its SWR fetcher:

```ts
const trpc = useTrpcClient(fetchToken);
useSWR(user ? ["minside.profile", getUserId(user)] : null, ([, donorId]) =>
  trpc.minside.profile.query({ donorId }),
);
```

We chose the plain client over `@trpc/tanstack-react-query` to avoid adding a second data-fetching
library next to SWR. Every call sends the Auth0 access token as a bearer token.

## Sites and the Danish REST link

All sites are built from apps/web. `apiFlavorFor(mainLocale)` (in `lib/trpc/client.ts`) picks the
link from the Sanity site setting `main_locale`, which Min Side already uses for Danish behaviour.
No Vercel environment variable is needed.

- **`dk` (giv-effektivt)**: the backend is giveffektivt/donation-platform, a separate REST
  service. `restLink` answers each procedure with the matching REST route, then validates
  `content` with the procedure's own output schema.
- **Everything else (main-site, and ge-effektivt)**: `httpBatchLink` to
  `${NEXT_PUBLIC_EFFEKT_API}/trpc`.

Sweden is phasing out Min Side, so we don't build or test anything Sweden-specific for it.
ge-effektivt takes the tRPC path: a call can fail there if `api.geeffektivt.se` runs an older
backend, and that is acceptable. The Swedish public pages don't use these calls.

The `restRoutes` table in `restLink.ts` maps procedures to REST routes:

```ts
"minside.profile": {
  method: "GET",
  path: (input) => `/donors/${input.donorId}/`,
  output: donorProfileOutput,
},
```

- A REST error status becomes a `TRPCClientError` with `data.code` and `data.httpStatus`, like a
  server error. Its message is the REST `content` or `message`.
- If a response doesn't match the output schema, the call fails ("unexpected response from the
  REST API"). It does not pass unchecked data on.
- An unmapped procedure fails with `<path> is not available on this site` (`NOT_IMPLEMENTED`)
  and makes no request. Hide or disable the feature on Danish Min Side.
- The Danish backend finds the donor by the token's email claim and ignores `:id`. It answers
  `id: 0`, which is why the profile schema allows 0.
- Its Postgres driver sends numeric columns as numbers and `COUNT(*)` as strings, where our
  backend sends MySQL decimals as strings. The schemas accept both (`decimal` in
  `src/trpc/shared/minside.ts`), and Min Side parses either. It also sends a few fields ours
  doesn't (`impact` on donations, `amount` on distributions), which the schemas declare as
  optional.

## Adding a procedure

1. Put the input and output schemas in `src/trpc/shared/minside.ts` (only `zod`). Give every
   procedure an explicit `.output()`, which strips fields you don't declare. Only add fields Min
   Side uses.
2. Add the procedure to `src/trpc/routers/minside.ts` with `donorProcedure(<the REST route's
permission>)`. For more input fields than `donorId`, pass a schema that extends `donorInput`:
   `donorProcedure(permission, donorInput.extend({ … }))` (`donorInput` is strict, so a chained
   `.input()` would reject the extra fields). Use `.query` for reads and `.mutation` for writes.
3. Test it in `src/__test__/trpc.minside.spec.ts`: anonymous (401), another donor (403),
   missing permission, bad input (400), the donor and an admin (200), and the output shape.
4. If the Danish backend implements the REST route (check
   `gh api repos/giveffektivt/donation-platform/contents/app/donors/[id]`), add it to
   `restRoutes` and to `restLink.test.ts`. If it doesn't, leave it unmapped. `restLink` only
   handles queries today. Before mapping a mutation, extend it with the method and body.
5. Switch the web hook to `trpc.minside.<name>.query(...)`. Keep its return shape and error
   object, and remove the REST fetch.

## Migration checklist (per Min Side area)

- [ ] Read the REST route and copy its permission and ownership check exactly
- [ ] Shared schemas in `src/trpc/shared/`, declaring only the fields the web uses
- [ ] Procedure and tests (see above); `pnpm test`, `npx tsc -p tsconfig.build.json --noEmit`
- [ ] Map it in `restRoutes` if the Danish backend has it; otherwise it fails on Danish Min Side
- [ ] Web hook migrated with the same loading and error states, and the same SWR key wherever
      other code calls `mutate(key)` (update those calls too)
- [ ] apps/web: `pnpm typecheck`, `pnpm lint`, `pnpm test`; check the main-site and giv-effektivt
      previews
- [ ] Norwegian Cypress tests (`apps/web/cypress/e2e/no`) stub the tRPC request, not the REST
      route: `cy.interceptTrpc("minside.<name>", data)`. httpBatchLink sends
      `GET /trpc/<path>?batch=1&input=…`, or `/trpc/a,b?batch=1` for calls made in the same tick,
      and expects one `{ "result": { "data": … } }` per path. `interceptTrpc` matches the path
      inside a batch and answers every path of the batch from the test's stubs. The Danish tests
      keep intercepting REST.
- [ ] Full-stack Cypress tests (`apps/web/cypress/e2e/fullstack`) wait on the real request with
      `cy.intercept("GET", trpcUrl("minside.<name>"))` and read its data with `trpcData()`
      (`cypress/support/trpc.js`).
- [ ] Keep the REST route: the Danish site and older clients still use it

## Deployment notes

- Vercel's ignored build step only checks `apps/web`, `pnpm-lock.yaml` and
  `pnpm-workspace.yaml`. A change to `src/trpc/shared/` or `packages/api/` alone changes what the
  web bundles, but it does not redeploy the website. Either add
  `../../src/trpc/shared ../../packages/api` to that command in the main-site, giv-effektivt and
  ge-effektivt project settings, or touch apps/web in the same PR.
- Deploy the backend procedure before the web code that calls it. The website switches to tRPC
  as soon as its build is deployed.
