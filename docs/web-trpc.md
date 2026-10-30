# tRPC on the website (apps/web)

The website's Min Side is moving from hand-written REST calls (`_queries.ts`) to the backend's
tRPC router, one call at a time. Migrated so far, all read-only:

| Procedure                      | Formerly                                | Hook                                             |
| ------------------------------ | --------------------------------------- | ------------------------------------------------ |
| `minside.profile`              | `GET /donors/:id`                       | `useDonor` (`DonorProvider`)                     |
| `minside.taxUnits`             | `GET /donors/:id/taxunits`              | `useTaxUnits`                                    |
| `minside.donationsAggregated`  | `GET /donors/:id/donations/aggregated`  | `useAggregatedDonations`                         |
| `minside.donations`            | `GET /donors/:id/donations`             | `useDonations`                                   |
| `minside.distributions`        | `GET /donors/:id/distributions/?kids=…` | `useDistributions`, `useAgreementsDistributions` |
| `minside.vippsAgreements`      | `GET /donors/:id/recurring/vipps`       | `useVippsAgreements`                             |
| `minside.avtaleGiroAgreements` | `GET /donors/:id/recurring/avtalegiro`  | `useAvtalegiroAgreements`                        |
| `minside.autoGiroAgreements`   | `GET /donors/:id/recurring/autogiro`    | `useAutogiroAgreements`                          |
| `minside.taxReports`           | `GET /donors/:id/taxreports`            | `useYearlyTaxReports`                            |

Mutations (the web helpers take the client from `useTrpcClient`):

| Procedure                                  | Formerly                                                    | Danish REST route                     |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------------------- |
| `minside.updateProfile`                    | `PUT /donors/:id`                                           | none                                  |
| `minside.createTaxUnit`                    | `POST /donors/:id/taxunits`                                 | `POST /donors/:id/taxunits`           |
| `minside.updateTaxUnit`                    | `PUT /donors/:id/taxunits/:taxunitid`                       | `PUT /donors/:id/taxunits/:taxUnitId` |
| `minside.deleteTaxUnit`                    | `DELETE /donors/:id/taxunits/:taxunitid`                    | none                                  |
| `minside.cancelVippsAgreement`             | `PUT /donors/:id/recurring/vipps/:agreementId/cancel`       | none                                  |
| `minside.updateVippsAgreementPrice`        | `PUT /donors/:id/recurring/vipps/:agreementId/price`        | none                                  |
| `minside.updateVippsAgreementChargeDay`    | `PUT /donors/:id/recurring/vipps/:agreementId/chargeday`    | none                                  |
| `minside.updateVippsAgreementDistribution` | `PUT /donors/:id/recurring/vipps/:agreementId/distribution` | none                                  |
| `minside.updateAvtaleGiroAmount`           | `POST /avtalegiro/:KID/amount`                              | none                                  |
| `minside.updateAvtaleGiroPaymentDate`      | `POST /avtalegiro/:KID/paymentdate`                         | none                                  |
| `minside.updateAvtaleGiroDistribution`     | `POST /avtalegiro/:KID/distribution`                        | none                                  |
| `minside.cancelAvtaleGiroAgreement`        | `POST /avtalegiro/:KID/status` (`active: 0`)                | none                                  |

Amounts are whole kroner (the procedures convert to øre). Still on REST: AutoGiro changes (Swedish),
the stopped-agreement feedback (`/agreementfeedback`), the Facebook payment registration and the
Danish agreement routes (`useDKAgreements`, `updateDKAgreement`, `cancelDKAgreement`).

SWR keys are in `minsideKeys` (`_queries.ts`); revalidate with `mutate(minsideKeys.taxUnits(id))`.

The agreement lists and tax reports have no Danish REST route, so `restLink` leaves them unmapped.
The Danish agreements page lists its own agreements with `useDKAgreements` (REST
`GET /donors/:id/recurring`, not migrated), and the Danish site has no yearly tax reports.

## Pieces

| Piece                                 | Where                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Donor-facing procedures               | `apps/api/src/trpc/routers/minside.ts` (mounted as `minside` in `apps/api/src/trpc/router.ts`) |
| `donorProcedure(permission, input?)`  | `apps/api/src/trpc/trpc.ts`                                                                    |
| Schemas shared with the web (runtime) | `apps/api/src/trpc/shared/minside.ts` (may only import `zod`)                                  |
| `@effekt/api` workspace package       | `packages/api`: `AppRouter` type + `@effekt/api/minside` schemas                               |
| Web client and links                  | `apps/web/lib/trpc/` (`client.ts`, `restLink.ts`, `useTrpcClient.ts`)                          |

### Auth

`donorProcedure(permission)` mirrors the REST donor routes
(`authMiddleware.auth(permission)` + `checkAdminOrTheDonor(id)`): the Auth0 token is verified by
the same validator, must carry `permission`, and its user id claim (`AUTH_USER_ID_CLAIM`) must
equal `input.donorId` unless the token has the `admin` permission. `donorId` is a positive integer,
like the REST routes' `:id` param. Errors: no or invalid token is `UNAUTHORIZED` (401); a missing
permission or another donor's id is `FORBIDDEN` (403; REST answers 401 for both).

### Types

`pnpm build:types` (root) emits the router's declarations to `apps/api/dist-types/`, as for the admin.
`packages/api/index.d.ts` re-exports `AppRouter` from there, and apps/web has `@effekt/api` as a
workspace dev dependency. apps/web runs the type build itself: `pnpm typecheck` and `pnpm build`
both start with `pnpm types:api`, which compiles with the API package's dependencies. So every
install that builds the web must include the API package: Vercel's install command and the CI
workflows use `pnpm install --frozen-lockfile --filter main-site --filter stiftelsen-effekt-backend`.
With `--filter main-site` alone, `next build` fails with `Cannot find module 'typescript/bin/tsc'`
(the API's dependencies moved out of the workspace root in the `apps/api` restructure).
Nothing generated is committed.

The output schemas are needed at runtime on the web (see the Danish site below), so they live in
`apps/api/src/trpc/shared/` and are bundled into the web through `@effekt/api/minside` (listed in
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
  `apps/api/src/trpc/shared/minside.ts`), and Min Side parses either. It also sends a few fields ours
  doesn't (`impact` on donations, `amount` on distributions), which the schemas declare as
  optional.

## The donation widget

The donation widget (`components/shared/components/Widget`) calls the public `widget` router
(`apps/api/src/trpc/routers/widget.ts`, schemas in `apps/api/src/trpc/shared/widget.ts`, exported
as `@effekt/api/widget`). No login, no token.

| Procedure                    | Formerly                       | Saga                                                                |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `widget.causeAreas`          | `GET /causeareas/all/`         | `layout/saga.ts` `fetchCauseAreas`; also Min Side's `useCauseAreas` |
| `widget.referralTypes`       | `GET /referrals/types`         | `referrals/saga.ts` `fetchReferrals`                                |
| `widget.registerDonation`    | `POST /donations/register`     | `donation/saga.ts` `registerDonation`                               |
| `widget.registerBankPending` | `POST /donations/bank/pending` | `donation/saga.ts` `registerBankPending`                            |
| `widget.submitReferral`      | `POST /referrals`              | `referrals/saga.ts` `submitReferral`                                |

Payment steps after registration (Norway and Sweden only; the Danish backend has none of these
routes, so the REST link leaves them unmapped and they fail without a request on the Danish site):

| Procedure                            | Formerly                                 | Caller                                                     |
| ------------------------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| `widget.draftVippsAgreement`         | `POST /vipps/agreement/draft`            | `donation/saga.ts`, `FundraiserWidget/useRegisterDonation` |
| `widget.draftAvtaleGiro`             | `POST /avtalegiro/draft`                 | `donation/saga.ts`, `FundraiserWidget/useRegisterDonation` |
| `widget.swishOrderStatus` (query)    | `GET /swish/orders/:id/status` (polled)  | `SwishPane`                                                |
| `widget.setAutoGiroDraftPaymentDate` | `PUT /autogiro/:KID/drafted/paymentdate` | `AutogiroPane`                                             |

- `widget.registerDonation` runs the same code as the REST route (`registerPendingDonation` in
  `apps/api/src/custom_modules/pendingDonationRegistration.ts`) with the same input schema
  (`registerDonationSchema`). Its output schema is lenient (nullish fields): it is checked after the
  donation is registered and the payment started, so it must not turn a registration into an error.
- The widget's client (`createPublicTrpcClient`) uses `httpLink`, not `httpBatchLink`: the backend
  refuses a batch that contains a widget mutation (`rejectBatchedWidgetMutations` in
  `apps/api/src/trpc/express.ts`), so the per-IP rate limit counts each registration.
- All calls go through `Widget/store/widgetApi.ts`. `Widget.tsx` sets the site from the widget's
  `locale` (Sanity `main_locale`) on mount. On the Danish site the two reads go through `restLink`
  (`/causeareas/all/`, `/referrals/types` on the Danish backend), and the three writes keep the
  original REST requests: the Danish `/donations/register` takes and answers a different shape
  (string donor ids, no KID for card payments, an empty 500 on errors), and the Danish backend has no
  bank-pending or referral route.
- The fundraiser widget (`FundraiserWidget/hooks/useRegisterDonation.ts`) registers gifts with
  `widget.registerDonation` too; on the Danish site it keeps its REST request, like the widget.
- The batch guard covers every `widget.*` mutation: `publicMutations` is read from the router.
- Stays REST for good: anything a payment provider, bank or email calls or links to
  (`/avtalegiro/:kid/redirect`, `/swish/qr/:token`, `/vipps/*` callbacks, `/donations/status`).

## Public site reads

The rest of the website calls the public `site` router (`apps/api/src/trpc/routers/site.ts`,
schemas in `apps/api/src/trpc/shared/site.ts`, exported as `@effekt/api/site`). No login, no token,
no batching: `publicTrpcFor(mainLocale)` in `lib/trpc/client.ts` (one client per site flavor). Blocks
pass their `locale` (Sanity `main_locale`); the fundraiser widget reads `useMainLocale()`, which the
main layout now provides too.

| Procedure              | Formerly                                 | Caller                                            | Danish site                          |
| ---------------------- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| `site.resultsHeadline` | `GET /results/headline`                  | `ResultsPage` (build), `ResultsTeaser`            | REST link, same route                |
| `site.dailyDonations`  | `GET /results/donations/daily`           | `ResultsPage` (build)                             | REST link, same route                |
| `site.referralSums`    | `GET /results/referrals/sums`            | `ResultsPage` (build)                             | REST link, same route                |
| `site.monthlyOutputs`  | `GET /results/donations/monthly/outputs` | `ResultsPage` (build)                             | REST link, same route                |
| `site.fundraiser`      | `GET /fundraisers/:id`                   | `FundraiserPage` (build)                          | REST link, same route (UUID ids)     |
| `site.ltvEstimate`     | `GET /ltv/recentestimate`                | `util/ltv.ts` (widget, `PlausibleRevenueTracker`) | unmapped (no route; the LTV is null) |
| `site.organizations`   | `GET /organizations/all/`                | Min Side `useAllOrganizations`                    | REST link, same route                |

- Each procedure runs the same code as its REST route: the monthly outputs and the LTV estimate
  moved into `custom_modules/monthlyOutputs.ts` and `custom_modules/ltv.ts`, which both call.
  None of these REST routes is cached, so neither are the procedures.
- The schemas accept both backends (our MySQL decimals as strings, the Danish numbers; the Danish
  fundraiser transactions have UUID ids). Live responses from both were checked against them.
- `site.fundraiser` takes the Sanity `fundraiser_database_id` as a number or a string of digits.
  A Danish response the schema rejects gets HTTP status 502 from the REST link, so the fundraiser
  page shows "no data" instead of failing the build.
- `site.resultsHeadline` answers `null` when the API's database user can't read
  `EffektAnalysisDB` (the Swedish API, `geeffektivt_api`): Sweden is being phased out and gets no
  grant, so the teaser shows 0 there instead of a 500.
- Min Side's `useCauseAreas` and `useAllOrganizations` use the public client (`publicTrpcFor`) and
  map the output to the widget's `CauseArea`/`Organization` types (`lib/trpc/causeAreas.ts`). The
  Danish backend's `/organizations/all` also has a "Smart fordeling" entry outside any cause area,
  so the organizations aren't derived from the cause areas.

Still REST, on purpose:

- `POST /forms/submit` (`SplitViewForm`): only the Danish backend has it.
- The fundraiser page's live updates are a WebSocket, not REST.
- Sanity Studio's calls (`/causeareas/all`, `/fundraisers/list`, `/results/...`, `/mail/...`).

Cypress: the Norwegian widget specs stub `cy.interceptTrpc("widget.<name>", data)`; `interceptTrpc`
answers an unbatched (httpLink) request with a single entry. The Danish widget specs keep
intercepting REST. `cypress/e2e/fullstack/widget.js` registers a bank donation against the local
stack and checks the rows with the `queryE2EDb` task.

## Adding a procedure

1. Put the input and output schemas in `apps/api/src/trpc/shared/minside.ts` (only `zod`). Give every
   procedure an explicit `.output()`, which strips fields you don't declare. Only add fields Min
   Side uses.
2. Add the procedure to `apps/api/src/trpc/routers/minside.ts` with `donorProcedure(<the REST route's
permission>)`. For more input fields than `donorId`, pass a schema that extends `donorInput`:
   `donorProcedure(permission, donorInput.extend({ … }))` (`donorInput` is strict, so a chained
   `.input()` would reject the extra fields). Use `.query` for reads and `.mutation` for writes.
3. Test it in `apps/api/src/__test__/trpc.minside.spec.ts`: anonymous (401), another donor (403),
   missing permission, bad input (400), the donor and an admin (200), and the output shape.
4. If the Danish backend implements the REST route (check
   `gh api repos/giveffektivt/donation-platform/contents/app/donors/[id]`), add it to
   `restRoutes` and to `restLink.test.ts`. If it doesn't, leave it unmapped. A mutation's
   route has a non-GET `method` and a `body(input)`.
5. Switch the web hook to `trpc.minside.<name>.query(...)`. Keep its return shape and error
   object, and remove the REST fetch.

## Migration checklist (per Min Side area)

- [ ] Read the REST route and copy its permission and ownership check exactly
- [ ] Shared schemas in `apps/api/src/trpc/shared/`, declaring only the fields the web uses
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
      inside a batch and answers every path of the batch from the test's stubs. Mutations are
      `POST /trpc/<path>?batch=1` with the body `{"0": input}`; `interceptTrpc` stubs them too, and
      `cy.interceptTrpcError(path, { code, httpStatus, message })` makes one fail. The Danish tests
      keep intercepting REST.
- [ ] Full-stack Cypress tests (`apps/web/cypress/e2e/fullstack`) wait on the real request with
      `cy.intercept("GET", trpcUrl("minside.<name>"))` and read its data with `trpcData()`
      (`cypress/support/trpc.js`). Add a new procedure to `TRPC_URLS` there first.
- [ ] Leave the REST route in place until the web deploy has settled, then remove it (see below)
      unless something else still calls it. The Danish site never calls our API: its paths are
      served by its own backend, so `restRoutes` documents that contract, not our routes.

## Removing REST routes

Remove a route once nothing calls it: search the repository (apps/web including Studio, apps/admin,
functions, scripts) and check production traffic since the web deploy. Norway goes through the load
balancer (`resource.type="http_load_balancer"`, host `data.gieffektivt.no`); Sweden's
`api.geeffektivt.se` is a Cloud Run domain mapping, so check the `geeffektivt` service's request logs.
Sweden runs the same API image, and its admin (`admin.geeffektivt.se`) still uses the old REST
admin client, so check its referer too.

Removed after the Min Side and widget migrations:

| Route                                                                                | Replaced by                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `GET /donors/:id/distributions/`                                                     | `minside.distributions`                                          |
| `GET /donors/:id/taxreports`                                                         | `minside.taxReports`                                             |
| `PUT /donors/:id/recurring/vipps/:agreementId/{cancel,price,chargeday,distribution}` | `minside.cancelVippsAgreement`, `minside.updateVippsAgreement*`  |
| `POST /avtalegiro/:KID/{amount,paymentdate,distribution,status}`                     | `minside.cancelAvtaleGiroAgreement`, `minside.updateAvtaleGiro*` |
| `POST /donations/bank/pending`                                                       | `widget.registerBankPending`                                     |
| `POST /referrals`                                                                    | `widget.submitReferral`                                          |

Kept, although Min Side and the widget no longer call them:

- `GET /donors/:id`, `/donors/:id/donations`, `/donations/aggregated`, `/taxunits`,
  `/recurring/{vipps,avtalegiro,autogiro}`, `PUT /donors/:id` and the tax unit writes: the Swedish
  admin calls them.
- `GET /referrals/types`: the Swedish admin's client still references it.
- `GET /causeareas/all`: Sanity Studio and the Swedish admin.
- `GET /organizations/all`: the REST contract the Danish backend implements for `site.organizations`.
- `PUT /autogiro/:KID/`: Swedish Min Side's AutoGiro changes are still REST.

## Deployment notes

- Vercel's ignored build step only checks `apps/web`, `pnpm-lock.yaml` and
  `pnpm-workspace.yaml`. A change to `apps/api/src/trpc/shared/` or `packages/api/` alone changes what the
  web bundles, but it does not redeploy the website. Either add
  `../../src/trpc/shared ../../packages/api` to that command in the main-site, giv-effektivt and
  ge-effektivt project settings, or touch apps/web in the same PR.
- Deploy the backend procedure before the web code that calls it. The website switches to tRPC
  as soon as its build is deployed.
