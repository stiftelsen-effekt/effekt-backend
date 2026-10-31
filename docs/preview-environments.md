# Preview environments

All preview infrastructure lives in its own GCP project, `effekt-previews`, so nothing the pipeline
can do reaches production (`hidden-display-243419`).

Every pull request gets its own running copy of the API and the new admin, filled with
synthetic data, at a link posted on the PR. Testers open the link, pick who they are and try
the change. Nobody logs in, and nothing in a preview can reach a real person, bank or payment
provider.

- [How it works](#how-it-works)
- [Tester guide](#tester-guide)
- [Iterating with @claude](#iterating-with-claude)
- [Limit and clean-up](#limit-and-clean-up)
- [Guardrails](#guardrails)
- [Infrastructure](#infrastructure)
- [Costs](#costs)
- [Going live](#going-live)
- [Later: custom domain](#later-custom-domain)
- [Later: the main site](#later-the-main-site)
- [Running a preview locally](#running-a-preview-locally)

## How it works

Previews are opt-in: add the `preview` label to a PR to deploy one. Pushes redeploy while the label is on; removing the label or closing the PR tears it down.

```
PR labelled `preview` / pushed ──► .github/workflows/preview.yml (pull_request_target, runs the main copy)
                         1. sticky PR comment: Building
                         2. docker build apps/api/Dockerfile.preview (PR code, no credentials yet)
                         3. log in to GCP (workload identity, no keys)
                         4. limit check (PREVIEW_MAX)        ── over: comment "Not created", stop
                         5. push image  ─► Artifact Registry effekt-previews
                         6. Cloud Run Job  effekt-preview-seed-pr-<n>:
                              drop + create preview_pr_<n>, prisma migrate deploy, seed
                         7. Cloud Run service effekt-preview-pr-<n> (min 0, max 2, public)
                         8. sticky PR comment: Ready, URL, commit, seed time
PR closed ─────────────► delete service, job, database, images; comment: Torn down
every night ───────────► .github/workflows/preview-janitor.yml (closed PRs, idle previews)
```

- **One preview per PR, replaced on every push.** The service name and URL stay the same for
  the PR's lifetime. A push cancels the PR's run in flight (concurrency group
  `preview-pr-<n>`), cancels a seed still running, deploys the new commit and re-seeds the
  database from scratch.
- **One image, two roles.** `apps/api/Dockerfile.preview` builds the backend, compiles the seed, and
  builds the admin with `vite build --mode preview`. Express serves the admin at `/` from the
  same origin as the API (`apps/api/src/custom_modules/preview/previewHttp.ts`): hashed assets under
  `/assets`, and `index.html` for browser navigations (requests that accept `text/html`), so
  admin paths such as `/donors/12` work although `/donors` is also a REST prefix. API calls
  don't ask for HTML and still reach the API. The production `apps/api/Dockerfile`, its
  `Dockerfile.dockerignore` (which excludes `apps/admin`) and image are unchanged: the preview
  build uses its own `apps/api/Dockerfile.preview.dockerignore`.
- **Database per PR.** All previews share the Cloud SQL instance `effekt-previews` (never
  `effekt-db`), one database `preview_pr_<n>` each. The seed is the synthetic dev data from
  `apps/api/prisma/devdata`: five years of donors, donations, agreements and regranting history, dated
  relative to the seed day, so a preview always looks current. Seeding takes about 10 seconds.
- **Why a Cloud Run Job for migrate + seed** (and not the Cloud SQL Auth Proxy on the runner):
  the job uses the same image and the same Cloud SQL socket as the service (and as production,
  see `CLOUD_SQL_CONNECTION_NAME` in `apps/api/src/custom_modules/DAO.ts`), the database password never
  leaves Google Cloud, the CI identity needs no Cloud SQL permission at all, and the instance
  needs no authorised networks. The cost is one extra Cloud Run resource per PR, deleted with
  the preview.

## Tester guide

1. Open the link in the PR's _Preview environment_ comment. If it says _Building_, wait a few
   minutes; the comment updates itself.
2. Pick who you are: **Ops** (`ops@example.org`), **Finance** (`finance@example.org`) or
   **Approver** (`approver@example.org`). All three are admins. There is no password.
3. The badge in the bottom-right corner always shows _Preview · synthetic data_, the PR,
   commit and seed time, and who you are. Click _You are …_ to switch person. Two-person flows
   need this: a regranting round must be approved by someone other than its creator, so create
   it as Finance and approve it as Approver.
4. Everything is fake. Names, emails and account numbers are generated. Nothing is sent: no emails,
   Vipps payments, bank (Mastercard Payment Services) files or Mailchimp syncs.
5. Every push resets the database. Don't build up state you need across pushes.
6. The first request after a quiet period takes a few seconds (the preview scales to zero).

## Iterating with @claude

`.github/workflows/claude.yml` runs
[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) (v1, pinned)
when someone writes `@claude …` in a comment or review on a PR, for example:

> @claude the approve button on the round page should be disabled while the request is running

Claude works on the PR's branch and commits there; the push redeploys the preview, and the
preview comment goes back to _Building_, then _Ready_.

- **Who can trigger it:** only people with write, maintain or admin permission on the
  repository, checked twice (a first step asks the GitHub API, and the action checks again).
  The repository is public, so comments from anyone else are ignored. Fork PRs are refused.
- **One-time setup (repository admin):**
  1. Install the Claude GitHub app on `stiftelsen-effekt/effekt-platform`:
     <https://github.com/apps/claude>. Its token is what lets Claude's commits start the Preview
     workflow (pushes made with the workflow's own `GITHUB_TOKEN` don't trigger workflows).
  2. Add the repository secret `ANTHROPIC_API_KEY` (Settings → Secrets and variables →
     Actions). `CLAUDE_CODE_OAUTH_TOKEN` or Anthropic workload identity federation work too; see
     the action's setup guide.
- Claude is told not to touch `.github/workflows/` or `scripts/preview/`; even if it did, those
  files only take effect after review and merge to `main` (see [Guardrails](#guardrails)).

## Limit and clean-up

| Variable (repository variables) | Default | Meaning                                                              |
| ------------------------------- | ------- | -------------------------------------------------------------------- |
| `PREVIEW_MAX`                   | 5       | Previews that may exist at once                                      |
| `PREVIEW_IDLE_WARN_DAYS`        | 14      | Days without a push before the PR gets a reminder comment            |
| `PREVIEW_IDLE_DELETE_DAYS`      | 21      | Days without a push before the preview is deleted (push to recreate) |

- **Over the limit**, a new PR gets no preview. Its comment says _Not created_ and lists the
  existing previews (PR, title, age, last deploy) and asks people to close or finish stale PRs.
  Nothing is evicted automatically. Once a slot is free, push to the PR (an empty commit is
  fine) to get a preview. Two PRs opened at the same moment can both pass the check, so the
  limit can briefly be exceeded by one or two.
- **The nightly janitor** (03:17 UTC, also runnable by hand, dry run by default) deletes
  previews of closed PRs (in case the close event was missed), reminds once per deploy after
  14 days without a push, deletes after 21, and removes seed jobs left behind by failed deploys.
- **Closing a PR** deletes its preview immediately.

## Guardrails

A preview gives anyone with the link admin rights over its data, so the data and the
environment must be harmless. The layers, from the outside in:

**Who can deploy what (GitHub + Google Cloud)**

- `preview.yml` uses `pull_request_target`, so the workflow file and `scripts/preview/*` always
  come from `main`. The workload identity provider only accepts tokens from this repository
  (by numeric id), from `refs/heads/main`, and from `preview.yml` or `preview-janitor.yml`.
  A PR that edits the workflow or the scripts can't get cloud credentials with its edit.
  (`main` is protected: pushes are restricted.)
- The PR's own code is only _built_ (before any credentials exist; checkouts keep no tokens)
  and _run on Cloud Run_ as `effekt-preview-run`.
- Fork PRs never deploy: every job requires
  `github.event.pull_request.head.repo.full_name == github.repository`.
- Workflow permissions are least privilege: `permissions: {}` at the top; jobs get
  `contents: read`, `pull-requests: write` (the comment) and `id-token: write` (the cloud login).
- Third-party actions are pinned to commit SHAs.

**What the identities can do**

| Identity                                  | Roles                                                                                                                                                 | Why / limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effekt-preview-run` (runtime)            | `roles/cloudsql.client` on the project **with an IAM condition**: only the `effekt-previews` instance                                                 | Connects the services and seed jobs to their databases. Can't connect to `effekt-db`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|                                           | `roles/secretmanager.secretAccessor` on the secret `effekt-preview-db-password` only                                                                  | The preview MySQL password, mounted as `DB_PASS`. (A resource-level grant on one secret; the alternative, a plain env var set by CI, would put the password in the CI logs' reach and the service config.)                                                                                                                                                                                                                                                                                                                                                       |
| `effekt-preview-ci` (GitHub Actions, WIF) | custom role `effektPreviewDeployer` (project): create/update/delete/list Cloud Run services, jobs, executions, revisions; `run.services.setIamPolicy` | Cloud Run has no IAM conditions on resource names, and the services don't exist before the first deploy, so this is project-wide. `setIamPolicy` is needed for `--no-invoker-iam-check` (public URL). **Limit:** it can't change what a production service runs: any deploy needs `iam.serviceAccounts.actAs` on the service's runtime account, and the CI account has that only on `effekt-preview-run`. It could delete another service; only the main-branch copies of the preview workflows can use it, and the scripts only touch `effekt-preview-*` names. |
|                                           | `roles/artifactregistry.repoAdmin` on the repository `effekt-previews` only                                                                           | Push images, delete a closed PR's images.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|                                           | `roles/iam.serviceAccountUser` on `effekt-preview-run` only                                                                                           | Deploy services/jobs that run as the runtime account, and as no other account.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|                                           | `roles/iam.workloadIdentityUser` (on itself) for the WIF principal set of this repository                                                             | GitHub Actions logs in without keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

The CI account has no Cloud SQL and no Secret Manager access: it never sees the database
password or data.

**The preview itself (`PREVIEW_MODE=true`)**

- **Startup guard** (`apps/api/src/custom_modules/preview/environmentGuard.ts`, tests in
  `apps/api/src/__test__/preview.spec.ts`): with `PREVIEW_MODE=true` the server, and every step of the
  seed job, refuses to start unless _all_ of these hold:
  - `PREVIEW_JWT_SECRET` is set (≥ 32 characters);
  - `DB_NAME` starts with `preview_` (and `DB_URL`, if set, names the same database);
  - the database is the previews instance: `CLOUD_SQL_CONNECTION_NAME` ends in
    `:effekt-previews` (required on Cloud Run), no `DB_HOST` / `DB_URL` naming `effekt-db`, no
    public IP as `DB_HOST`;
  - no production secret or integration is configured: Vipps, MailerSend, Mailchimp, Mastercard
    Payment Services SFTP, Auth0 (M2M client, MCP client, log stream / register
    webhooks, the tenant itself), the analysis MCP database, survey export, Tidbyt,
    site revalidation, Redis (the full list is `FORBIDDEN_PREVIEW_SETTINGS`);
  - `NODE_ENV` isn't `production` (previews run `NODE_ENV=preview`: Vipps test API, no stack
    traces in responses);
  - `K_SERVICE` / `CLOUD_RUN_JOB`, if set, start with `effekt-preview-`.
- **Auth:** `POST /preview/session {"as": "ops" | "finance" | "approver"}` returns a 12-hour
  HS256 token signed with `PREVIEW_JWT_SECRET` (new random value per deploy, set by the
  pipeline). The existing checks accept it **only when `PREVIEW_MODE` is exactly `true`**: the
  REST `auth`/`isAdmin` middleware and the tRPC context pick the preview check instead of Auth0
  (`selectJwtCheck`); with it off they are built exactly as before. Tokens carry the admin
  permissions, never `analysis_mcp`. The admin only offers "Continue as…" in builds made with
  `--mode preview`; production builds keep refusing dev and preview auth
  (`apps/admin/src/auth/mode.ts`).
- **Off in previews:** `/scheduled/*` (no Cloud Scheduler jobs exist for previews either),
  `/mcp`, `/oauth` and the OAuth discovery documents.
- **Every response** carries `X-Robots-Tag: noindex, nofollow`.
- **Rate limiting, honeypot, CORS and the rest of the middleware stay as they are.**
- **Synthetic data only:** the seed is generated (`apps/api/prisma/devdata`); no production rows exist
  anywhere in the previews instance.

What the guard is not: a PR can change the guard itself, since it is part of the PR's code.
The hard boundary is the infrastructure above (a runtime account that can reach only the
previews instance, no production secrets anywhere in its reach). The guard catches
misconfiguration, such as a production variable or database name copied into a preview.

## Infrastructure

`scripts/preview/provision.sh` creates everything. **Dry run by default** (prints every
command), `--apply` to execute. It first checks every name read-only and stops on a clash with
anything it didn't create (marker label `managed-by=effekt-preview-provision` or a marker in
the description); re-running skips what already exists. It never changes or deletes existing
resources; the only touches on existing ones are additive IAM bindings for the two new
accounts, and enabling the STS API (`sts.googleapis.com`, needed for workload identity
federation) if it's off.

| Resource                     | Name                                                                                                                                                      | Notes                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cloud SQL instance           | `effekt-previews`                                                                                                                                         | MySQL 8.4, Enterprise, `db-f1-micro`, 10 GB SSD, zonal, no backups/binlog, no authorised networks |
| Cloud SQL user               | `preview`                                                                                                                                                 | password generated, stored only in the secret below                                               |
| Secret                       | `effekt-preview-db-password`                                                                                                                              |                                                                                                   |
| Artifact Registry repository | `effekt-previews` (docker, europe-north1)                                                                                                                 | cleanup policy: untagged after 1 day, everything after 30 days                                    |
| Service accounts             | `effekt-preview-run`, `effekt-preview-ci`                                                                                                                 | roles in [Guardrails](#guardrails)                                                                |
| Custom role                  | `effektPreviewDeployer`                                                                                                                                   |                                                                                                   |
| Workload identity pool       | `github-effekt-previews`, provider `effekt-backend`                                                                                                       | condition: repository id, `refs/heads/main`, the two preview workflows                            |
| GitHub variables             | `PREVIEW_MAX`, `PREVIEW_IDLE_WARN_DAYS`, `PREVIEW_IDLE_DELETE_DAYS`, `PREVIEW_GCP_PROJECT`, `PREVIEW_GCP_REGION`, `PREVIEW_WIF_PROVIDER`, `PREVIEW_CI_SA` | existing ones are left as they are                                                                |

Per PR, created and deleted by the workflows: service `effekt-preview-pr-<n>`, job
`effekt-preview-seed-pr-<n>`, database `preview_pr_<n>`, images `backend:pr-<n>-<sha>`. Services
and jobs are labelled `preview=true,pr=<n>` (plus `sha` and `deployed-at` on services).

`scripts/preview/teardown-all.sh` (dry run by default, `--apply`) removes all of it again.
All names live in `scripts/preview/config.sh`.

Service settings: ingress all, no invoker IAM check (public), min 0 / max 2 instances,
1 vCPU, 512 MiB, request-based billing. Seed job: 1 vCPU, 1 GiB, no retries, 15 min timeout.

## Costs

Rough monthly estimate at list prices for europe-north1, with up to 5 previews used a few
hours a week:

| Item                                | Estimate     | Notes                                                                                                                                                                               |
| ----------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud SQL `db-f1-micro` + 10 GB SSD | ≈ $10–12     | Runs all the time (Cloud SQL doesn't scale to zero). Shared vCPU; if seeding or regranting gets slow with several previews, `PREVIEW_SQL_TIER=db-g1-small provision.sh` (≈ $28–30). |
| Cloud Run services (min 0)          | ≈ $0–10      | Billed only while handling requests; ~100 active hours a month ≈ $9 before the free tier                                                                                            |
| Seed job runs                       | < $1         | ~1 minute per push                                                                                                                                                                  |
| Artifact Registry                   | ≈ $1–3       | ~0.7 GB compressed per image; per-PR deletion + 30-day cleanup                                                                                                                      |
| Secret Manager, WIF, GitHub Actions | ≈ $0         | Actions minutes are free on public repositories                                                                                                                                     |
| Claude (`@claude`)                  | per use      | API usage on the `ANTHROPIC_API_KEY` account, typically cents to a few dollars per request                                                                                          |
| **Total**                           | **≈ $30–45** | ≈ $15–25 with `db-f1-micro`                                                                                                                                                         |

Possible later savings: stop the instance (activation policy `NEVER`) when no preview exists,
and a slimmer base image.

## Going live

1. Review and merge this to `main`. The workflows run from `main` (`pull_request_target`),
   so nothing happens on PRs before that, and nothing works before step 2 (every job is skipped
   while `PREVIEW_WIF_PROVIDER` is unset).
2. A project owner runs `scripts/preview/provision.sh`, reads the dry run, then
   `scripts/preview/provision.sh --apply` (the Cloud SQL instance takes ~10 minutes).
3. For `@claude`: install the Claude GitHub app and add `ANTHROPIC_API_KEY`
   (see [Iterating with @claude](#iterating-with-claude)).
4. Open (or push to) a PR and watch the _Preview_ workflow. Run _Preview janitor_ by hand with
   _dry run_ to check it.

## Later: custom domain

Today previews live on `run.app` URLs
(`https://effekt-preview-pr-<n>-565259612547.europe-north1.run.app`). For
`https://effekt-preview-pr-<n>.preview.gieffektivt.no`:

1. **Certificate Manager:** a wildcard certificate for `*.preview.gieffektivt.no` with DNS
   authorisation (add the `_acme-challenge.preview.gieffektivt.no` CNAME it prints at
   Domeneshop), in a certificate map.
2. **Load balancer:** a separate global external Application Load Balancer for previews (not
   `effekt-api-lb`) with one serverless NEG using a **URL mask** `<service>.preview.gieffektivt.no`,
   so the first label of the host picks the Cloud Run service; attach the certificate map; a
   Cloud Armor policy if wanted. Grant the CI account nothing new: new services are picked up
   by the mask automatically.
3. **DNS at Domeneshop:** `*.preview.gieffektivt.no A <load balancer IP>`.
4. Switch the services to `--ingress internal-and-cloud-load-balancing`, set
   `TRUST_PROXY_HOPS=2` in `deploy.sh` (one more proxy hop), and post the new URL in the
   comment (`preview_url` in `scripts/preview/config.sh`).

Extra cost: about $18/month for the forwarding rule, plus certificate fees above the free tier.

## Later: the main site

The main site (Next.js, deployed on Vercel with its own preview deployments) could use a
backend preview the same way: a main-site preview deployment points its API URL at
`effekt-preview-pr-<n>` (a PR-to-PR mapping, e.g. by branch name or a label), and its donation
flow then talks to synthetic data. CORS already allows any origin in previews (`NODE_ENV` isn't
`production`). Payments stay off: the guard keeps Vipps unconfigured, so flows that
need a provider stop at that step. Building it means: a way to pair a main-site PR with a
backend PR, and passing `PREVIEW_*` facts to the site for its own banner.

## Running a preview locally

```sh
docker build -f apps/api/Dockerfile.preview -t effekt-preview:local .
docker network create preview-net
docker run -d --name preview-mysql --network preview-net -e MYSQL_ROOT_PASSWORD=pw \
  mysql:8.4.11 --innodb-buffer-pool-size=192M --performance-schema=OFF
SECRET=$(openssl rand -hex 32)
docker run --rm --network preview-net -e PREVIEW_JWT_SECRET=$SECRET -e DB_HOST=preview-mysql \
  -e DB_USER=root -e DB_PASS=pw -e DB_NAME=preview_pr_0 \
  effekt-preview:local scripts/preview/migrate-and-seed.sh
docker run --rm --network preview-net -p 5199:8080 -e PORT=8080 -e PREVIEW_JWT_SECRET=$SECRET \
  -e DB_HOST=preview-mysql -e DB_USER=root -e DB_PASS=pw -e DB_NAME=preview_pr_0 \
  effekt-preview:local
# open http://localhost:5199
docker rm -f preview-mysql && docker network rm preview-net && docker rmi effekt-preview:local
```
