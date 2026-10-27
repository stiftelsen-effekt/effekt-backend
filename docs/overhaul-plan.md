# Backend + admin overhaul

Goal: replace effekt-admin (React 18 + redux-saga + styled-components) with a new admin that
talks to the backend over tRPC, with a consistent design system, and move main-site to tRPC too.

## Constraints

- **Our backend sets the API; DK aligns to it.** main-site serves NO, SE and DK. DK points
  `NEXT_PUBLIC_EFFEKT_API` at a separate backend (giveffektivt/donation-platform, maintained by
  Giv Effektivt DK) that mirrors our REST shapes. We design the tRPC API for our needs and do not
  bend it for DK. Until DK ships the tRPC procedures main-site uses, main-site keeps its REST
  client behind the DK site config only, so the DK donation flow doesn't go down; it is deleted
  once DK has aligned.
- REST routes stay where something outside main-site and the admin calls them: payment provider
  callbacks (Vipps, PayPal, Swish), Auth0 hooks/log stream, MailerSend, the api-scheduled Cloud
  Function, the minside-redirect function, Sanity studio, Tidbyt feeds and email links.
- Merges to `master` deploy to production (Cloud Build → migrate → Cloud Run), so every merge
  must be additive and green.

## Architecture

```
effekt-backend/
  src/
    routes/        REST (unchanged contract) ─┐
    trpc/          tRPC routers at /trpc     ─┼─► services / DAO_modules (shared logic)
  admin/           new admin SPA (own package.json), imports `type AppRouter`
```

- tRPC v11 mounted at `/trpc` in the existing Express app. Plain JSON transport (no superjson)
  so dates serialise exactly as in REST.
- Auth: the tRPC context verifies the bearer token with the same Auth0 validator as REST.
  `adminProcedure` requires the `admin` permission. Donor-scoped procedures come later.
- Input validation with zod v4. Schemas live next to the routers and are the source of truth
  for request/response shapes.
- The admin consumes declaration output of `src/trpc/router.ts`; the backend needs
  `strictNullChecks` for zod/tRPC inference to be correct.

### Admin stack

Vite, React 19, TanStack Router (file-based, typed search params for filters), TanStack Query via
`@trpc/tanstack-react-query`, TanStack Table, Tailwind CSS v4 + shadcn/ui (Radix), react-hook-form

- zod, `@auth0/auth0-react` v2, Recharts. Build-time `VITE_LOCALE=NO|SV` stays.

### Design system

See `admin/DESIGN.md` (principles, IA, templates, patterns, tokens, components) and the live
reference at `/design`. In short: calm paper/ink neutrals with one accent and three state tones,
light and dark, comfortable/compact density; IA grouped by job (Donors · Money in · Agreements ·
Records · Settings) with a Home that lists what needs attention; ⌘K search; URL-backed filter
bar with saved views; click-to-peek lists with keyboard navigation; one agreement model across
Vipps/AvtaleGiro/AutoGiro; one distribution editor; a persistent review queue. Feature pages are
built from the `ListPage`, `DetailPage`, `FlowPage` and `SettingsPage` templates.

## Phases

0. **Foundation** — TS 5.9, zod, tRPC skeleton, `strictNullChecks`, `/trpc` mounted, permission
   tests. Local docker-compose environment with seeded MySQL and a dev token issuer.
1. **tRPC routers per domain**, reusing DAOs: config (cause areas, organizations, referral
   types, owners, payment methods), donors, donations, distributions, tax units, Vipps,
   AvtaleGiro, AutoGiro, fundraisers, reports/uploads, logs. REST handlers and
   procedures share the same functions; REST contract tests guard the shapes.
2. **Admin scaffold + design system** in `admin/`.
3. **Admin feature pages** to parity with the old admin (checklist below), in parallel.
4. **Local stack**: extend `compose.dev.yml` so one command runs backend, new admin and main-site
   (Min Side) against seeded data and the local token issuer.
5. **Cut-over**: deploy the new admin next to the old one, switch DNS, archive effekt-admin,
   remove REST routes that only the old admin used (none that main-site, DK or externals use).
6. **main-site → tRPC**: donor-scoped procedures (Min Side, agreements, tax units) and public
   ones (widget registration, cause areas, results). Type sharing across repos via a published
   `@effekt/api` types package or by moving main-site into this repo (decide when we get there).
   Hand DK the procedure list to implement; remove main-site's DK REST path once they have.
   Then delete REST routes that no remaining caller uses.

## Parity checklist (old admin)

Home dashboard · Donors list/filter/export · Donor page (key info edit, merge, yearly chart, tabs:
donations, distributions, AvtaleGiro, AutoGiro, Vipps, tax units, referrals) · Donations
list/filter/histogram/export · Donation page (edit, delete, resend receipt) · Distributions
list/create/page · Register (report uploads per source, KU65 XML, AutoGiro shipments, single
donation, resend receipt) · Manual review queue · Logs list/entry · Vipps agreements/charges
(refund)/matching rules · AvtaleGiro list/page/validation · AutoGiro list/page/mandates ·
Fundraisers · Referral types · Cause areas · Organizations · Donor picker with query
syntax · Distribution input · Tax unit create/edit/archive-with-transfer.

Known bugs not to port: dead mandate/fundraiser detail links, unauthenticated report form POST,
mis-wired fetch actions, NOK hard-coded in SE charts, Norwegian-only tax ID validation.

## Security follow-ups

The unauthenticated admin paths (`PUT /tax/:id`, `POST /logging/`, `POST /donations/:id/receipt`,
`POST /donors/auth0/register`) were closed in #788. Still open: MailerSend webhooks have no
signature check, and the Vipps `PUT /vipps/agreement/:urlcode/*` routes rely on the urlcode alone.
