# The website (apps/web)

[`apps/web`](../apps/web) (package `main-site`) is the public site and Min Side for all three countries:
gieffektivt.no, giveffektivt.dk and geeffektivt.se. It is a Next.js app (pages router). Public pages are
statically generated from [Sanity](https://www.sanity.io) content; Min Side (`/dashboard`) is client-side,
signs in with Auth0 and calls the API. Each country is its own Vercel project with its own Sanity dataset.

## Running it

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm web:dev            # from the repo root; http://localhost:3000
```

- The Sanity project in `.env.example` is a test dataset, so content differs from production. Ask the
  team for the production project ids if you need them.
- `NEXT_PUBLIC_EFFEKT_API` points at the local API (`pnpm dev:env:up`). The file has commented
  alternatives for the Swedish and Danish backends.

## Structure

- **Routing**: localized paths need custom routing. Only files ending in `.page.tsx` are Next.js routes;
  [`pages/[state]/[[...slug]].page.tsx`](../apps/web/pages/%5Bstate%5D/%5B%5B...slug%5D%5D.page.tsx) parses the slug
  and renders the right page type. Page types (`GenericPage.tsx`, `ArticlePage.tsx`, ...) live in `pages/`
  and export their static paths and props, built with `withStaticProps()` (`util/withStaticProps.ts`).
- **Layouts**: public pages use `components/main/layout/layout.tsx`. Min Side pages (`pages/dashboard/`)
  use `components/profile/layout/layout.tsx`, which wraps them in the Auth0 provider and is loaded only
  for users who log in, keeping the public payload small. `pages/_app.page.tsx` picks the layout.
- **Content**: data is fetched with [next-sanity](https://github.com/sanity-io/next-sanity) and
  [GROQ](https://www.sanity.io/docs/groq) queries in each page's static props.
- **Min Side data**: the API is called with the user's Auth0 access token. Calls are moving from REST
  (`components/profile/_queries.ts`, `hooks/useApi.ts`) to tRPC; see [web-trpc.md](web-trpc.md). The
  donor id the API uses is the token claim `https://gieffektivt.no/user-id`, not the Auth0 user id.

## Sanity Studio

The Studio lives in `apps/web/studio` and is built into `public/studio` on every site build (`prebuild`).
Only `SANITY_STUDIO_*` variables reach it; `studio/sanity.cli.ts` maps a few of the site's variables to
those names. Run these in `apps/web` (you need a Sanity user; ask in the tech channel):

```bash
pnpm sanity                         # Studio on http://localhost:3333
pnpm sanity:edit <documentId> [dataset]   # edit a document as JSON; drafts use the drafts. prefix
pnpm sanity:list:pages
```

Publishing in the `production` dataset triggers a rebuild of the site.

## Checks

Run in `apps/web` (or `pnpm web:test`, `pnpm web:lint`, `pnpm web:typecheck` from the root):

- `pnpm test`: Jest unit tests (`*.test.ts` next to the code).
- `pnpm lint`: ESLint. Errors that predate CI are recorded in `eslint-suppressions.json`; don't add
  new ones, and prune stale entries with `pnpm exec eslint . --prune-suppressions`.
- `pnpm typecheck`.
- Cypress end-to-end suites: see [e2e.md](e2e.md).

`web-checks.yml` runs lint, typecheck and unit tests on PRs. Merges to `main` deploy through Vercel.
