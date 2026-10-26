# Backend + admin overhaul

Goal: replace effekt-admin (React 18 + redux-saga + styled-components) with a new admin that
talks to the backend over tRPC, with a consistent design system — without breaking any existing
REST consumer.

## Constraints

- **REST is a public contract.** main-site serves NO, SE and DK. DK points
  `NEXT_PUBLIC_EFFEKT_API` at a separate backend (giveffektivt/donation-platform, maintained by
  Giv Effektivt DK) that mirrors our REST shapes. Every REST route keeps its path, method, auth
  and `{ status, content }` envelope. Other REST consumers: payment provider callbacks (Vipps,
  PayPal, Swish), Auth0 hooks/log stream, MailerSend, the api-scheduled Cloud Function, the
  minside-redirect function, Sanity studio, Tidbyt feeds and email links.
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
- Input validation with zod v4. Schemas live next to the routers and become the source of truth
  for request/response shapes. They can later generate an OpenAPI description of the REST
  contract, which main-site (and DK) can type against without changing the wire format.
- The admin consumes declaration output of `src/trpc/router.ts`; the backend needs
  `strictNullChecks` for zod/tRPC inference to be correct.

### Admin stack

Vite, React 19, TanStack Router (file-based, typed search params for filters), TanStack Query via
`@trpc/tanstack-react-query`, TanStack Table, Tailwind CSS v4 + shadcn/ui (Radix), react-hook-form

- zod, `@auth0/auth0-react` v2, Recharts. Build-time `VITE_LOCALE=NO|SV` stays.

### Design system

Keep the spirit of the current admin — monochrome, typographic, square, tool-like — and make it
consistent:

- Tokens as CSS variables (light + dark): neutral scale replacing the dozen ad-hoc greys, one
  accent, semantic success/warning/destructive, radius 0–2px, one shadow.
- ES Klarheit Grotesk (body) and Kurrent (display) fonts, tabular numerals instead of Courier.
- One button, input, select, combobox, date-range, badge, dialog and toast implementation.
- Layout primitives: black sidebar, page header with the left bar, data table + filter sheet,
  key-value "key info" panel, stat cards.

## Phases

0. **Foundation** — TS 5.9, zod, tRPC skeleton, `strictNullChecks`, `/trpc` mounted, permission
   tests. Local docker-compose environment with seeded MySQL and a dev token issuer.
1. **tRPC routers per domain**, reusing DAOs: config (cause areas, organizations, referral
   types, owners, payment methods), donors, donations, distributions, tax units, Vipps,
   AvtaleGiro, AutoGiro, fundraisers + Adoveo, reports/uploads, logs. REST handlers and
   procedures share the same functions; REST contract tests guard the shapes.
2. **Admin scaffold + design system** in `admin/`.
3. **Admin feature pages** to parity with the old admin (checklist below), in parallel.
4. **Cut-over**: deploy the new admin next to the old one, switch DNS, archive effekt-admin,
   remove REST routes that only the old admin used (none that main-site, DK or externals use).
5. **main-site**: typed REST client generated from the shared schemas (wire format unchanged).

## Parity checklist (old admin)

Home dashboard · Donors list/filter/export · Donor page (key info edit, merge, yearly chart, tabs:
donations, distributions, AvtaleGiro, AutoGiro, Vipps, tax units, referrals) · Donations
list/filter/histogram/export · Donation page (edit, delete, resend receipt) · Distributions
list/create/page · Register (report uploads per source, KU65 XML, AutoGiro shipments, single
donation, resend receipt) · Manual review queue · Logs list/entry · Vipps agreements/charges
(refund)/matching rules · AvtaleGiro list/page/validation · AutoGiro list/page/mandates ·
Fundraisers · Adoveo · Referral types · Cause areas · Organizations · Donor picker with query
syntax · Distribution input · Tax unit create/edit/archive-with-transfer.

Known bugs not to port: dead mandate/fundraiser detail links, unauthenticated report form POST,
mis-wired fetch actions, NOK hard-coded in SE charts, Norwegian-only tax ID validation.

## Security follow-ups

The unauthenticated admin paths (`PUT /tax/:id`, `POST /logging/`, `POST /donations/:id/receipt`,
`POST /donors/auth0/register`) were closed in #788. Still open: MailerSend webhooks have no
signature check, and the Vipps `PUT /vipps/agreement/:urlcode/*` routes rely on the urlcode alone.
