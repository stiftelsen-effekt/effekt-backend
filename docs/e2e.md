# Website e2e tests

The website (`apps/web`) has two Cypress suites:

| Suite      | Config                                         | Runs against                                             | Data                                           | Login                          |
| ---------- | ---------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| Deployment | `cypress-no.config.ts`, `cypress-dk.config.ts` | Vercel deployments (`web-ci.yml` → `web-e2e.yml`)        | `cy.intercept` fixtures in `cypress/fixtures/` | real Auth0 test user (secrets) |
| Full stack | `cypress-fullstack.config.ts`                  | local web → API → MySQL (`web-e2e-fullstack.yml` on PRs) | the real API and DB, seeded by `prisma/e2e/`   | local OIDC issuer, no secrets  |

## Running the full-stack suite

```sh
pnpm install
pnpm e2e:fullstack                 # up -> build web -> cypress run -> down
pnpm e2e:fullstack --spec cypress/e2e/fullstack/agreements.js
```

Needs Docker. Timings on a laptop (M-series, warm Docker image cache): stack up ~20 s (~90 s on
a cold image build), `next build` ~150 s, tests ~10 s.

For writing tests, keep everything running and open Cypress:

```sh
E2E_KEEP_UP=1 pnpm e2e:fullstack
cd apps/web && pnpm exec cypress open --config-file cypress-fullstack.config.ts
# later: kill the printed web server pid; pnpm e2e:env:down
```

`E2E_SKIP_BUILD=1` reuses the last build in `apps/web/.next` (the build overwrites a normal
`next build` there). Ports: web 3100, API 5150, OIDC 8191, MySQL 3317 (`E2E_*_PORT`), separate
from `pnpm dev:env:up`, so both stacks can run at once.

## What runs

`compose.dev.yml` + `compose.e2e.yml`, project `effekt-e2e`:

- `db`: MySQL 8.4 in tmpfs (gone on `down`).
- `migrate`: migrations and the generated dev data, with `SEED_NOW` fixed.
- `seed-e2e`: `prisma/e2e/seed.mjs`, a deterministic donor (id 900001) with Vipps (2 active,
  1 stopped), AvtaleGiro (2), AutoGiro (1) agreements, donations from 2022–2025 and two tax
  units (the bank transfers go to the second). Ids and KIDs live in `prisma/e2e/data.mjs`,
  which specs import. The Cypress task `resetE2EData` re-runs the seed (~0.2 s), and specs call
  it in `beforeEach`.
- `auth` + `oidc`: the mock OIDC issuer behind a small nginx (see below).
- `api`: the backend, accepting tokens from the local issuer.

The web app is built and served on the host (`next build` + `next start`), not in a container:
Cypress needs the host `node_modules` anyway, and CI reuses the pnpm cache instead of installing
and building a second time inside Docker. `next build` prerenders ~600 pages and calls the API
for some of them, so it runs after the stack is up.

### Content (Sanity)

Pages come read-only from the public production dataset (`vf0df6h3` / `production`). It needs no
token. Content edits can therefore change what the tests see. Specs should assert on data from
the API, not on Sanity copy beyond stable labels such as "Aktive" or "Lagret".

### Login

The website logs in with `@auth0/auth0-react` (auth0-spa-js). Pointed at a non-Auth0 issuer it:

- calls `${domain}/authorize` and `${domain}/oauth/token`, and
- requires the ID token's `iss` to equal `${domain}/` (with the trailing slash) when the domain
  is `http://`. The `issuer` option only applies to `https://` issuers.

The mock issuer (`ghcr.io/navikt/mock-oauth2-server`) serves `/<issuerId>/authorize` and
`/<issuerId>/token` and derives `iss` (and the signing key) from the path. So
`NEXT_PUBLIC_AUTH_DOMAIN=http://localhost:8191` points at an nginx (`oidc`) that maps
`/authorize`, `/oauth/token` and `/.well-known/jwks.json` onto the mock's `web` issuer. That
issuer's claim mapping sets `iss` to `http://localhost:8191/` and `aud` to both the client id (ID
token check) and the API audience. The API gets `AUTH_ADDITIONAL_ISSUERS=http://localhost:8191/`
and checks signatures against the JWKS at `http://oidc:8080/.well-known/jwks.json`. No
application code changes and no test-only login path. The browser goes through the real
redirect → login form → code + PKCE → token flow.

`cy.loginFullstack(donorId)` fills in the mock's login form: any username plus
`{"https://gieffektivt.no/user-id": <donorId>}` as claims. Admin tokens for test setup through
the API: `POST http://localhost:8191/oauth/token` with `grant_type=client_credentials`,
`scope=admin`.

## Migrating a spec from the deployment suite

1. Copy it to `cypress/e2e/fullstack/` and drop the `cy.intercept` stubs and fixtures. Keep
   intercepts only as aliases to wait on real responses.
2. Add whatever the spec needs to `prisma/e2e/seed.mjs` and `data.mjs`, then assert on those
   values.
3. Call `cy.task("resetE2EData")` and `cy.loginFullstack(DONOR_ID)` in `beforeEach`.
4. Calls to third parties are not available locally. The backend runs without Vipps, Nets,
   MailerSend etc. credentials. Vipps agreement price changes and cancellation call the Vipps
   API first, so they fail here. Those cases need a stub of the third-party API in the stack,
   not of our API.

Keep the deployment spec as long as it adds coverage against production.
