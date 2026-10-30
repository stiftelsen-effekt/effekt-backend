# Deploying the new admin

Proposal for running the new admin (`admin/`) in production next to the old one, then replacing it.

## Today

- The old admin (effekt-admin repo) is a static build in the bucket `static.gieffektivt.no`,
  served by the `effekt-load-balancer` (backend bucket `effekt-admin`, IP 34.120.57.224) at
  `admin.gieffektivt.no`. It uses hash routing (`/#/...`), so the bucket needs no rewrites.
- DNS for `gieffektivt.no` is at Domeneshop (`ns1.hyp.net`).
- The API allows the origins in `ALLOWED_PRODUCTION_ORIGINS` on the `effektapi` Cloud Run service
  (already includes `https://admin.gieffektivt.no`).
- Auth0 SPA client `jg0jOryc8mhJ0Z0FVLfrDxx5qaznd2x8` on `gieffektivt.eu.auth0.com`, audience
  `https://data.gieffektivt.no`.

## Plan

### 1. Side by side at `admin-next.gieffektivt.no`

| Piece           | Change                                                                                                                                                                                                                       | Who              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Bucket          | New bucket `admin-next.gieffektivt.no` (europe-north1, uniform access, public read for the LB).                                                                                                                              | Claude (gcloud)  |
| Load balancer   | New backend bucket `admin-next` on `effekt-load-balancer`; host rule for `admin-next.gieffektivt.no`. The new admin uses real paths (`/donors/12`), so a route rule rewrites everything except `/assets/*` to `/index.html`. | Claude (gcloud)  |
| Certificate     | Google-managed certificate for `admin-next.gieffektivt.no`, added to the LB's HTTPS proxy next to the existing one.                                                                                                          | Claude (gcloud)  |
| DNS             | `A admin-next.gieffektivt.no → 34.120.57.224`. The certificate provisions once this resolves.                                                                                                                                | You (Domeneshop) |
| Auth0           | Add `https://admin-next.gieffektivt.no` to Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins of the admin SPA client.                                                                                       | You (Auth0)      |
| API CORS        | Append `https://admin-next.gieffektivt.no` to `ALLOWED_PRODUCTION_ORIGINS` on `effektapi`.                                                                                                                                   | Claude (gcloud)  |
| Build + publish | `cloudbuild.admin.yaml`: install, typecheck, test, build with production Auth0 settings, upload assets (immutable) then `index.html` (no-cache).                                                                             | In the repo      |
| Trigger         | Cloud Build trigger `AdminDeploy` on pushes to `main` touching `admin/**`, `src/trpc/**`, `pnpm-lock.yaml`, `cloudbuild.admin.yaml`; substitutions `_BUCKET`, `_API_URL`, `_AUTH_*`.                                         | Claude (gcloud)  |

Merging `admin/` into `main` doesn't affect the backend image: `.dockerignore` excludes `admin/`
and the image installs with `--filter stiftelsen-effekt-backend` (checked with the admin package
present in the lockfile and absent from the build context).

### 2. Team uses both

The team works in the new admin while the old one stays at `admin.gieffektivt.no` as a fallback.
Gaps found in daily use get fixed here.

### 3. Cut over

Point the `admin.gieffektivt.no` host rule at the new backend bucket (the certificate and Auth0
entry for that host already exist), keep `admin-next` as an alias for a while, then archive the
effekt-admin repo and delete its buckets and the REST routes only it used.

## Not included

- No Swedish build: the admin is Norway-only.
- No staging environment: there's no working dev API (`dev.data.gieffektivt.no` and
  `dev.admin.gieffektivt.no` point at addresses that no longer exist). Local testing uses
  `compose.dev.yml`.
