# Deploying the new admin

How the new admin (`apps/admin/`) is hosted, and the plan that put it in production next to the old
one, then replaced it.

## Today

- Since 2026-10-28 `admin.gieffektivt.no` is the new admin: the `effekt-load-balancer` (IP
  34.120.57.224) routes the host to the backend bucket `effekt-admin-v2` (bucket
  `effekt-admin-v2-static`). `/assets/*` is served as is; every other path is rewritten to
  `/index.html`, since the admin uses real paths (`/donors/12`).
- `cloudbuild.admin.yaml` (trigger `AdminDeploy`) builds and publishes it.
- The old admin (effekt-admin repo, archived) was a static build in the bucket
  `static.gieffektivt.no`, served through the backend bucket `effekt-admin`.
- DNS for `gieffektivt.no` is at Domeneshop (`ns1.hyp.net`).
- The API allows the origins in `ALLOWED_PRODUCTION_ORIGINS` on the `effektapi` Cloud Run service
  (already includes `https://admin.gieffektivt.no`).
- Auth0 SPA client `jg0jOryc8mhJ0Z0FVLfrDxx5qaznd2x8` on `gieffektivt.eu.auth0.com` (custom domain
  `login.gieffektivt.no`, which the build uses), audience `https://data.gieffektivt.no`.

## Security headers

The load balancer adds these to every response from `effekt-admin-v2` (the backend bucket's
`customResponseHeaders`), so they cover `index.html` and the assets alike:

| Header                      | Value                                      |
| --------------------------- | ------------------------------------------ |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`      |
| `X-Content-Type-Options`    | `nosniff`                                  |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`          |
| `X-Frame-Options`           | `DENY`                                     |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy`   | see below                                  |

```
default-src 'self';
script-src 'self' 'sha256-<hash of the inline script in index.html>';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://data.gieffektivt.no https://login.gieffektivt.no;
frame-src https://login.gieffektivt.no;
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Why each source is there:

- `script-src`: the bundle is same-origin. `index.html` has one inline script (theme and density
  before first paint), allowed by its hash. **If you change that script, update the hash**:
  otherwise the browser blocks it, the console shows a CSP error and dark-mode users see a flash of
  the light theme until React applies their preferences.
- `style-src 'unsafe-inline'`: Radix (scroll lock in dialogs) and sonner (toasts) insert `<style>`
  elements at runtime. React `style={{…}}` props are not affected by CSP.
- `connect-src`: the tRPC API, and Auth0's `/oauth/token` (the token exchange after login).
- `frame-src`: auth0-spa-js renews the session in a hidden iframe on `login.gieffektivt.no`
  (`prompt=none`, `response_mode=web_message`). Login and logout are full-page redirects, which
  CSP doesn't restrict.
- Fonts and the logo are bundled (`/assets/`); `data:` images are allowed in case a component uses
  one. Downloads (CSV exports) use `blob:` links, which CSP doesn't restrict.
- `includeSubDomains` covers only `*.admin.gieffektivt.no`, not other `gieffektivt.no` hosts.

Adding a new origin (an analytics script, an image CDN, another API) means adding it to the right
directive here first; until then the browser blocks it and logs a CSP error in the console.

To change the headers, edit the list and run (the flag replaces the whole list, so pass every
header):

```bash
gcloud compute backend-buckets update effekt-admin-v2 --project hidden-display-243419 \
  --custom-response-header="Strict-Transport-Security: max-age=31536000; includeSubDomains" \
  --custom-response-header="X-Content-Type-Options: nosniff" \
  …
curl -sI https://admin.gieffektivt.no/   # takes about a minute to show
```

To compute the hash of the inline script from the live page:

```bash
curl -s https://admin.gieffektivt.no/ | python3 -c 'import base64,hashlib,re,sys; \
  s=re.findall(r"<script>(.*?)</script>", sys.stdin.read(), re.S)[0]; \
  print("sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())'
```

Remove them all again with `--no-custom-response-headers`. Before changing the CSP, check the
production build with it: serve `apps/admin/dist` with the header (assets under `/assets/`,
everything else `index.html`), run the Playwright suites against it and look for CSP errors in the
console. Preview environments (served by the API) don't send these headers.

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
| Trigger         | Cloud Build trigger `AdminDeploy` on pushes to `main` touching `apps/admin/**`, `apps/api/src/trpc/**`, `pnpm-lock.yaml`, `cloudbuild.admin.yaml`; substitutions `_BUCKET`, `_API_URL`, `_AUTH_*`.                           | Claude (gcloud)  |

Merging `apps/admin/` into `main` doesn't affect the backend image: `apps/api/Dockerfile.dockerignore` excludes `apps/admin/`
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
