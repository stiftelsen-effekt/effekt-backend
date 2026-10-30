# Monorepo cutover: the website (apps/web)

The website (formerly the `stiftelsen-effekt/main-site` repository) lives in this repository
under `apps/web`, with its full git history. Merging the import changes nothing in production:
the three Vercel projects keep building from `main-site` until the cutover below is done.

This document lists everything that has to change outside the repository, in order, and how
to undo it. Steps marked **(admin)** need access to Vercel, GitHub repository settings, GCP or
the Semgrep/Cypress dashboards.

**Overall order:** merge the import PR → [1](#1-freeze-main-site-and-final-sync) freeze →
[2](#2-github-secrets-access-and-branch-protection) secrets, access and branch protection →
[3](#3-cloud-build-triggers) Cloud Build → [8](#8-repo-rename-effekt-backend-to-effekt-platform)
rename to `effekt-platform` → final sync (step 1.3) → [4](#4-vercel) Vercel, connecting
`effekt-platform` directly → [6](#6-archive-main-site) archive main-site. Vercel links
repositories by id, so renaming first means the Vercel step never has to be redone.

- [What the import changed](#what-the-import-changed)
- [1. Freeze main-site and final sync](#1-freeze-main-site-and-final-sync)
- [2. GitHub secrets, access and branch protection](#2-github-secrets-access-and-branch-protection)
- [3. Cloud Build triggers](#3-cloud-build-triggers)
- [4. Vercel](#4-vercel)
- [5. Sanity Studio](#5-sanity-studio)
- [6. Archive main-site](#6-archive-main-site)
- [7. Rollback](#7-rollback)
- [8. Repo rename (effekt-backend to effekt-platform)](#8-repo-rename-effekt-backend-to-effekt-platform)
- [9. Verification checklist](#9-verification-checklist)

## What the import changed

| Area           | Now                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code           | `apps/web/` (imported with `git filter-repo --to-subdirectory-filter apps/web`; `git log --follow apps/web/<file>` shows the old history). The import point is main-site `main` at `a417d9ac`.                                                                                                    |
| Workspace      | `apps/web` is a member of the root `pnpm-workspace.yaml`. One root `pnpm-lock.yaml`; the website kept its exact versions. Package name stays `main-site`.                                                                                                                                         |
| Sanity Studio  | `apps/web/studio` stays a separate npm project with its own `package-lock.json` (not a workspace member). The website's `prebuild` script installs and builds it into `public/studio`, as before.                                                                                                 |
| Root scripts   | `pnpm web:dev`, `web:build`, `web:typecheck`, `web:test`, `web:lint`. Or work in `apps/web` directly.                                                                                                                                                                                             |
| Git hooks      | The root husky hook runs lint-staged; files under `apps/web` use `apps/web`'s lint-staged config (Prettier 3), the rest the root's.                                                                                                                                                               |
| Backend, admin | The backend's tsconfig, Prettier and Docker contexts leave `apps/` out. `Dockerfile` is unchanged; `Dockerfile.preview`, `cloudbuild.admin.yaml` and `cloud.qa.yaml` install only the packages they build.                                                                                        |
| GitHub Actions | `web-checks.yml` (lint, typecheck, Vitest; path-filtered), `web-ci.yml` (on Vercel `deployment_status`, picks the Cypress suite by project name), `web-e2e.yml` (reusable Cypress run), `zizmor.yml` (all workflows). `CODEOWNERS`, `dependabot.yml` and the issue templates moved to `.github/`. |

Until the cutover, `web-ci.yml` does nothing: no Vercel project deploys from this repository
yet, so no matching `deployment_status` events arrive.

## 1. Freeze main-site and final sync

1. From the moment the import PR is opened: **no merges to main-site `main`**. Changes to the
   website go to this repository (against `apps/web`) instead. Hotfixes that cannot wait go to
   main-site and get synced below.
2. Open main-site PRs (one at the time of writing) are re-created here. Their diff applies with
   the path prefix:

   ```sh
   # in a clone of main-site, on the PR branch
   git format-patch origin/main --stdout > /tmp/pr.patch
   # in this repository, on a new branch
   git am --directory=apps/web /tmp/pr.patch
   ```

3. Right before the Vercel cutover, sync any main-site commits made after the import point
   (`a417d9ac`). Rewrite a fresh clone the same way and merge it; commits that are already
   imported are recognised, so only the new ones come in:

   ```sh
   git clone --branch main --single-branch https://github.com/stiftelsen-effekt/main-site.git /tmp/main-site-sync
   git -C /tmp/main-site-sync filter-repo --to-subdirectory-filter apps/web
   git remote add web /tmp/main-site-sync   # or: git remote set-url web /tmp/main-site-sync
   git fetch --no-tags web
   git log --oneline HEAD..web/main          # what is new since the import
   git merge --no-edit web/main
   pnpm install                              # if apps/web/package.json changed
   ```

   If a synced commit touches `apps/web/pnpm-lock.yaml` or `apps/web/pnpm-workspace.yaml`,
   delete them again (they live at the root now) and regenerate the root lockfile.

## 2. GitHub secrets, access and branch protection

**(admin)** Create these repository secrets on `stiftelsen-effekt/effekt-backend` with the same
values as on main-site (GitHub can't copy secret values; take them from the password manager or
the Cypress Cloud / Auth0 dashboards):

| Secret                  | Used by                                  |
| ----------------------- | ---------------------------------------- |
| `CYPRESS_AUTH_DOMAIN`   | `web-e2e.yml` (Auth0 login in the tests) |
| `CYPRESS_AUTH_USERNAME` | `web-e2e.yml`                            |
| `CYPRESS_AUTH_PASSWORD` | `web-e2e.yml`                            |
| `CYPRESS_RECORD_KEY`    | `web-e2e.yml` (Cypress Cloud recording)  |

```sh
gh secret set CYPRESS_AUTH_DOMAIN   -R stiftelsen-effekt/effekt-backend
gh secret set CYPRESS_AUTH_USERNAME -R stiftelsen-effekt/effekt-backend
gh secret set CYPRESS_AUTH_PASSWORD -R stiftelsen-effekt/effekt-backend
gh secret set CYPRESS_RECORD_KEY    -R stiftelsen-effekt/effekt-backend
```

`SEMGREP_APP_TOKEN` already exists on both repositories.

Cypress Cloud: in the project's settings, connect the GitHub integration to this repository so
the "cypress: GiEffektivt e2e tests" status check keeps appearing on commits.

`claude.yml` reads `ANTHROPIC_API_KEY`, which isn't a repository secret here yet; add it if the
`@claude` workflow should run.

### Access

**(admin)** Website contributors need write access here, or GitHub ignores them as code owners
and they can't open branches. Write access to this repository covers the backend and admin
too; code-owner review on `master` (below) keeps those merges with fellmirr.

```sh
R=stiftelsen-effekt/effekt-backend
for u in EliseAndresen jadypamella Sumiya-Sayeed max-baz; do
  gh api -X PUT "repos/$R/collaborators/$u" -f permission=push
done
gh api "repos/$R/codeowners/errors?ref=master" -q '.errors | length'   # expect 0 once invites are accepted
```

`max-baz` is admin on main-site; here he gets write, without admin or review bypass. New
collaborators must accept the invitation before they count as code owners.

### Branch protection

**(admin)** main-site requires 1 approval with code-owner review (bypass: fellmirr, max-baz).
Here: 1 approval with code-owner review, bypass for fellmirr only. `CODEOWNERS` gives fellmirr
everything except Elise's areas in `apps/web`, so backend and admin PRs need fellmirr, and
display components, styles and Sanity schemas can be approved by Elise. fellmirr's own PRs
need the admin bypass (GitHub doesn't allow approving your own PR).

```sh
gh api -X PATCH repos/stiftelsen-effekt/effekt-backend/branches/master/protection/required_pull_request_reviews \
  --input - <<'JSON'
{"required_approving_review_count": 1, "require_code_owner_reviews": true,
 "dismiss_stale_reviews": false, "bypass_pull_request_allowances": {"users": ["fellmirr"]}}
JSON
```

If `required_pull_request_reviews` isn't enabled yet, the PATCH returns 404; use
`PUT .../branches/master/protection` with the full body instead (keep the existing required
check "QualityAssurance (hidden-display-243419)", `enforce_admins: false`). main-site's
"Vercel – …" and "cypress: GiEffektivt e2e tests" checks are not carried over as required:
Vercel reports skipped builds as successful, but Cypress only runs for website deployments.

## 3. Cloud Build triggers

**(admin)** Project `hidden-display-243419`. All triggers on this repository are 1st-gen
(GitHub app) triggers. Current state and the change needed so commits that only touch the
website don't redeploy the backend:

| Trigger                                                                           | Config                  | Branch             | Files filter now                                                               | Change                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ----------------------- | ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BackendDeploy`                                                                   | `cloud.deploy.yaml`     | `^master$`         | none                                                                           | add ignored files `apps/web/**`                                                                                                                                                                                      |
| `AdminDeploy`                                                                     | `cloudbuild.admin.yaml` | `^master$`         | included: `admin/**`, `src/trpc/**`, `pnpm-lock.yaml`, `cloudbuild.admin.yaml` | none required. Website dependency bumps also change `pnpm-lock.yaml` and so redeploy the admin; that is harmless.                                                                                                    |
| `QualityAssurance`                                                                | `cloud.qa.yaml`         | not `dev`/`master` | none                                                                           | none. It is the required status check, so it must keep running on every PR (an ignored-files filter would leave website-only PRs without the check and block them). It installs only the backend's dependencies now. |
| `BackendDeploy-Stage`, `BackendDeploy-Dev`, `BackendDeploy-Secrets` (`1e3a4aa9…`) |                         |                    |                                                                                | disabled; no change                                                                                                                                                                                                  |

```sh
gcloud builds triggers update github BackendDeploy \
  --project hidden-display-243419 --ignored-files='apps/web/**'
gcloud builds triggers describe BackendDeploy --project hidden-display-243419 \
  --format='yaml(name,ignoredFiles,includedFiles)'
```

Do this **before** the first sync merge in step 1, since every merge to `master` that touches
only `apps/web` otherwise rebuilds and redeploys the backend (harmless, but slow and noisy). The
import PR itself also redeploys the backend once when merged, which is expected.

## 4. Vercel

**(admin)** Team `effective-altruism-norway`, projects `main-site` (NO), `giv-effektivt` (DK)
and `ge-effektivt` (SE). Today each is linked to `stiftelsen-effekt/main-site`, production
branch `main`, root directory = repository root, "Include files outside the root directory" on,
default install and build commands, no ignored build step.

Do one project first (suggested: `ge-effektivt`, lowest traffic), check its production
deployment, then the other two.

**Before starting (admin):** the Vercel GitHub app is installed on selected repositories; add
`effekt-platform` to its selection (GitHub → Settings → Applications → Vercel → Configure),
or the repository won't show up under Connect. The Cypress and Semgrep apps likewise.

**Deploy hooks are per repository and branch.** Today: `main-site` has `sanity-hook` and
`scheduler-hook`, `giv-effektivt` has `Sanity deploy hook`, `ge-effektivt` has `sanity`, all
on ref `main`. Vercel drops a project's deploy hooks when its repository is disconnected, and
`main` doesn't exist here. Write down which systems call each hook URL (the Sanity webhooks
for each dataset, and whatever calls `scheduler-hook`) before step 1 below.

### Dashboard, for each project

Change the build settings **before** connecting the new repository: once it is connected, any
push to `master` builds, and with the old settings that builds the repository root.

1. **Settings → Build and Deployment → Root Directory**: `apps/web`. Keep **Include files
   outside the root directory in the Build Step** on (it is needed for the root lockfile and
   workspace file). This only affects new deployments; production keeps serving the current one.
2. **Settings → Build and Deployment → Install Command** (override on):
   `pnpm install --frozen-lockfile --filter main-site`
   Without the filter, pnpm installs the whole workspace (backend and admin included, and runs
   the backend's `prisma generate`). pnpm's version comes from `packageManager` (12.15.0); the
   root and `apps/web` declare the same one.
3. **Build Command**: leave the default (`pnpm run build`; pnpm runs the `prebuild` script that
   builds the Studio). **Node.js version**: set 24.x (it is 22.x today; `apps/web/package.json`
   `engines` 24.x already wins in the build, but keep them consistent).
4. **Settings → Git → Ignored Build Step** → Custom command (runs in `apps/web`; exit 0 skips
   the build, exit 1 builds):

   ```sh
   [ "$VERCEL_ENV" = production ] || [ -z "$VERCEL_GIT_PREVIOUS_SHA" ] && exit 1; git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../../pnpm-lock.yaml ../../pnpm-workspace.yaml
   ```

   Production always builds, as today: deploy hooks (Sanity publishes, scheduled content)
   rebuild without a code change, and skipping those would leave content stale. Previews build
   only when `apps/web` or the root workspace files changed since the branch's last deployment,
   and always on a branch's first deployment. If the previous SHA isn't in Vercel's shallow
   clone, `git diff` fails and the build runs. Backend-only merges to `master` therefore still
   rebuild the websites (a few minutes, no behaviour change).

5. **Settings → Git → Connected Git Repository**: Disconnect `main-site`, then Connect
   `stiftelsen-effekt/effekt-platform` (or `effekt-backend` if the rename hasn't happened).
6. **Settings → Git → Production Branch**: `master`. Check it after connecting; connecting
   may reset it to the repository's default branch, which is `master` here anyway.
7. **Settings → Git → Deploy Hooks**: recreate each hook from the list above with branch
   `master`, and replace the URL wherever it is called (Sanity → API → Webhooks for each
   dataset; the scheduler). Trigger one hook by hand and check a production deployment starts.
8. **`giv-effektivt` only — Settings → Environments → `api-dev`** (serves
   `dev.giveffektivt.dk`): its branch rule is "starts with `main`"; change it to the branch that
   should feed the DK dev environment here (for example `master`, or a `dk-dev` branch). With
   no matching branch it stops updating.
9. Environment variables, domains, deployment protection: unchanged (they belong to the
   project, not the repository).
10. Deploy: **Deployments → Create Deployment** from `master`, or merge something under
    `apps/web`. Check the build log for the root directory and the filtered install, then the
    site.

### CLI and API equivalent

The Git connection is changed with the Vercel CLI from a directory linked to the project; the
build settings with `vercel api` (Vercel CLI 55+, REST API with the CLI's login). Per project
(`main-site`, `giv-effektivt`, `ge-effektivt`):

```sh
P=ge-effektivt; T=--scope=effective-altruism-norway
D=$(mktemp -d) && cd "$D" && vercel link --yes --project "$P" $T
vercel api "/v9/projects/$P" $T --raw | jq '{rootDirectory, installCommand, commandForIgnoringBuildStep, sourceFilesOutsideRootDirectory, link: .link | {repo, repoId, productionBranch}}'  # before
vercel api "/v9/projects/$P" -X PATCH $T --input - <<'JSON'
{
  "rootDirectory": "apps/web",
  "sourceFilesOutsideRootDirectory": true,
  "nodeVersion": "24.x",
  "installCommand": "pnpm install --frozen-lockfile --filter main-site",
  "commandForIgnoringBuildStep": "[ \"$VERCEL_ENV\" = production ] || [ -z \"$VERCEL_GIT_PREVIOUS_SHA\" ] && exit 1; git diff --quiet \"$VERCEL_GIT_PREVIOUS_SHA\" HEAD -- . ../../pnpm-lock.yaml ../../pnpm-workspace.yaml"
}
JSON
vercel git disconnect $T
vercel git connect https://github.com/stiftelsen-effekt/effekt-platform $T
```

Deploy hooks and the `api-dev` environment are dashboard steps (7 and 8 above).

The production branch (`master`) is set in the dashboard (Settings → Git); the public API has
no documented field for it. Run the "before" query again afterwards to check.

### After the cutover

- Every PR in this repository gets Vercel preview deployments for the three projects (skipped
  by the ignored build step when `apps/web` is untouched). `web-ci.yml` runs Cypress against
  successful `main-site` and `giv-effektivt` deployments, as on main-site.
- The worktrunk hook in `apps/web/.config/wt.toml` no longer runs (worktrunk reads
  `.config/wt.toml` at the repository root). Copy `apps/web/.env.local` into new worktrees by
  hand, or move the hook to the root in a later change.

## 5. Sanity Studio

The Studio has no separate deployment: `prebuild` builds it into `apps/web/public/studio` and
Next serves it at `/studio` on each site, so it moves with the Vercel cutover. Nothing to do in
Sanity (the hosts and CORS origins stay the same).

Local work on the Studio:

```sh
cd apps/web/studio && npm ci
cd .. && pnpm sanity        # Studio dev server, reads apps/web/.env.local
```

`npm run typegen` (in `apps/web/studio`) and `pnpm run deploy-dk-dataset` (in `apps/web`) work
from their new paths unchanged.

## 6. Archive main-site

After all three Vercel projects have deployed production from this repository and the e2e
suite has passed once:

1. **(admin)** On main-site: replace the README with a pointer to `apps/web` in this
   repository, then **Settings → Archive this repository** (`gh repo archive
stiftelsen-effekt/main-site`). Archiving keeps the history, issues and PRs readable.
2. Remove the main-site secrets (`CYPRESS_*`, `SEMGREP_APP_TOKEN`) once archived.

Keep the repository (don't delete it) for at least the rollback window.

## 7. Rollback

Until main-site is archived, rollback is a settings change per Vercel project:

1. Settings → Git: disconnect this repository, reconnect `stiftelsen-effekt/main-site`,
   production branch `main`.
2. Root Directory: empty (repository root). Install Command and Ignored Build Step: back to
   default/off.
3. Recreate the deploy hooks with branch `main` and put the URLs back in Sanity and the
   scheduler; for `giv-effektivt`, set the `api-dev` branch rule back to "starts with `main`".
4. Redeploy production from main-site `main`, or use **Instant Rollback** to the last
   production deployment built from main-site (faster, no build).

CLI/API: the same commands as above with `vercel git connect
https://github.com/stiftelsen-effekt/main-site` and the PATCH body `{"rootDirectory": null,
"installCommand": null, "commandForIgnoringBuildStep": null}`; production branch `main` in the
dashboard.

Website changes merged here in the meantime must be ported back to main-site
(`git format-patch` + `git am -p3`, which strips `apps/web/`). If main-site was already
archived, unarchive it first.

## 8. Repo rename (effekt-backend to effekt-platform)

GitHub redirects the old URL (web, git and API) after a rename, but several integrations match
on the repository **name** and stop working until they are updated. The repository **id**
(86714950) does not change. This section is an inventory; nothing has been renamed.

### Inventory

**Cloud Build triggers** (project `hidden-display-243419`). All are 1st-gen GitHub app triggers
(`github.owner`/`github.name`, global); there are no 2nd-gen repository connections for this
repository. 1st-gen triggers match the repository by owner/name, so after the rename pushes
stop triggering builds until each is updated:

| Trigger                                                                     | State                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| `BackendDeploy` (`cloud.deploy.yaml`, `^master$`)                           | enabled: **must** update                         |
| `AdminDeploy` (`cloudbuild.admin.yaml`, `^master$`)                         | enabled: **must** update                         |
| `QualityAssurance` (`cloud.qa.yaml`, other branches; required status check) | enabled: **must** update, or every PR is blocked |
| `BackendDeploy-Stage`, `BackendDeploy-Dev`, unnamed `1e3a4aa9-…`            | disabled: update or delete                       |

```sh
for t in BackendDeploy AdminDeploy QualityAssurance; do
  gcloud builds triggers update github "$t" --project hidden-display-243419 \
    --repo-owner stiftelsen-effekt --repo-name effekt-platform
done
gcloud builds triggers list --project hidden-display-243419 \
  --format='table(name,github.owner,github.name,disabled)' | grep -i effekt-
```

If `update github` asks for more flags (it can, depending on the trigger), use export/import:
`gcloud builds triggers export BackendDeploy --destination t.yaml`, change `github.name`, then
`gcloud builds triggers import --source t.yaml`. The status check name "QualityAssurance
(hidden-display-243419)" does not change, so branch protection keeps matching it.

**Preview pipeline: workload identity** (project `effekt-previews`). The provider
`github-effekt-previews/effekt-backend` has this attribute condition:

```
assertion.repository_id == '86714950' && assertion.repository_owner_id == '51704270'
&& assertion.ref == 'refs/heads/master'
&& (assertion.job_workflow_ref == 'stiftelsen-effekt/effekt-backend/.github/workflows/preview.yml@refs/heads/master'
 || assertion.job_workflow_ref == 'stiftelsen-effekt/effekt-backend/.github/workflows/preview-janitor.yml@refs/heads/master')
```

The id checks keep working; the `job_workflow_ref` checks contain the name and fail after the
rename, so previews and the janitor lose GCP access. The service account binding
(`principalSet://…/attribute.repository_id/86714950`) uses the id and needs no change.
`scripts/preview/provision.sh` only creates the provider and does not update an existing one,
so update it directly:

```sh
gcloud iam workload-identity-pools providers update-oidc effekt-backend \
  --project effekt-previews --location global --workload-identity-pool github-effekt-previews \
  --attribute-condition "assertion.repository_id == '86714950' && assertion.repository_owner_id == '51704270' && assertion.ref == 'refs/heads/master' && (assertion.job_workflow_ref == 'stiftelsen-effekt/effekt-platform/.github/workflows/preview.yml@refs/heads/master' || assertion.job_workflow_ref == 'stiftelsen-effekt/effekt-platform/.github/workflows/preview-janitor.yml@refs/heads/master')" \
  --description "stiftelsen-effekt/effekt-platform preview workflows on master. Managed by scripts/preview/provision.sh (preview environments)"
```

The provider id (`effekt-backend`) and the `PREVIEW_WIF_PROVIDER` repository variable can stay
as they are; renaming the provider means creating a new one and is not needed.

**Repository files** that name the repository (`git grep -n effekt-backend`):

| File                                                                                                                          | Change with the rename                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/preview/config.sh` (`PREVIEW_GITHUB_REPO`)                                                                           | yes: `stiftelsen-effekt/effekt-platform` (provision.sh checks the name against the id) |
| `scripts/preview/provision.sh` (`--display-name "effekt-backend previews"`)                                                   | optional                                                                               |
| `.github/workflows/claude.yml` (system prompt text)                                                                           | yes, cosmetic                                                                          |
| `README.md` (clone URL), `docs/preview-environments.md` (Claude app install, WIF table)                                       | yes                                                                                    |
| `package.json` `repository`/`bugs`/`homepage` (point at an old `fellmirr/effekt-backend`)                                     | yes, while at it                                                                       |
| `compose.dev.yml` (`image: effekt-backend-dev:local`), `docs/*` history notes, code comments, `apps/web` README and a comment | no (local image tag, historical references)                                            |

**Package name.** The root package is `stiftelsen-effekt-backend` and is used by `--filter` in
`Dockerfile`, `Dockerfile.preview`, `cloudbuild.admin.yaml`, `cloud.qa.yaml`, `compose.dev.yml`
and `docs/admin-deployment.md`. Keep it for the rename: it names the backend package, not the
repository, and changing it touches every build at once. If the backend later moves to
`apps/api`, rename it then (for example to `@effekt/api`) together with those filters.

**Other integrations**

| Integration                                                                                                 | After the rename                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vercel                                                                                                      | Linked by repository id (`repoId`). The overall order does the rename before the Vercel cutover (section 4), so Vercel connects `effekt-platform` directly. If it ever runs the other way round, check that pushes still create deployments and reconnect if not.                                                                                                  |
| Semgrep app                                                                                                 | `semgrep ci` names the project after `GITHUB_REPOSITORY`, so the first scan after the rename creates a new project `stiftelsen-effekt/effekt-platform` without the old one's triage history. Rename the existing project in the Semgrep app (Projects → settings) right after the rename, before the next scan, or accept the new project and archive the old one. |
| Dependabot, branch protection, rulesets, Actions secrets and variables, environments, webhooks, deploy keys | Move with the repository; no change.                                                                                                                                                                                                                                                                                                                               |
| Claude GitHub app                                                                                           | Installed per repository (by id); keeps working. Check under the org's installed apps that it lists `effekt-platform`.                                                                                                                                                                                                                                             |
| Cypress Cloud                                                                                               | GitHub integration: check the project still shows the repository; reconnect if not.                                                                                                                                                                                                                                                                                |
| GitHub Actions `uses:`                                                                                      | Only `$/` (self-repository) references; no change.                                                                                                                                                                                                                                                                                                                 |

**Local clones and worktrees**

```sh
cd ~/Code/effekt-cloud/effekt-backend
git remote set-url origin https://github.com/stiftelsen-effekt/effekt-platform.git
git worktree list   # worktrees share the remote; no per-worktree change needed
```

Renaming the directories (`effekt-backend*` to `effekt-platform*`) is optional. If you do,
move the main checkout and then run `git worktree repair` from it so the worktrees find it
again (worktrunk names new worktrees after the main directory).

### Order of operations

Prepare beforehand: a PR here that updates `scripts/preview/config.sh`, `README.md`,
`docs/preview-environments.md`, `claude.yml` and `package.json` URLs (ready to merge, not
merged), and the commands above in a terminal.

1. Pick a quiet time; make sure no preview deploy or Cloud Build is running.
2. **(admin)** Rename the repository: Settings → General → Repository name, or
   `gh repo rename effekt-platform -R stiftelsen-effekt/effekt-backend`.
3. **Within minutes:** update the three enabled Cloud Build triggers (until then pushes to
   `master` don't deploy and PRs get no QualityAssurance check).
4. **Within minutes:** update the workload identity provider condition (until then preview
   deploys and the janitor fail to authenticate).
5. **Before the next Semgrep run** (any PR, push or the nightly schedule): rename the Semgrep
   app project.
6. Merge the prepared PR (it also tests steps 3 to 5: QualityAssurance and Semgrep should run;
   add the `preview` label to a test PR to check previews).
7. Update local remotes; check Vercel, Cypress Cloud and the Claude app.

### Rename verification

- [ ] `gh repo view stiftelsen-effekt/effekt-platform --json id` shows id 86714950.
- [ ] `gcloud builds triggers list` shows `effekt-platform` for BackendDeploy, AdminDeploy and
      QualityAssurance.
- [ ] A PR gets "QualityAssurance (hidden-display-243419)" and `semgrep/ci`.
- [ ] A merge to `master` runs BackendDeploy (and AdminDeploy when admin files changed).
- [ ] A PR with the `preview` label deploys a preview; the janitor's next run succeeds.
- [ ] The Semgrep app shows one project, with its earlier findings and triage.
- [ ] Vercel projects show `stiftelsen-effekt/effekt-platform` under Settings → Git, and a
      push to `master` touching `apps/web` deploys production.

## 9. Verification checklist

Before the Vercel cutover:

- [ ] Import PR merged; `git log --follow apps/web/pages/_app.page.tsx` shows history back to
      January 2022.
- [ ] main-site has had no merges since the final sync (`git log HEAD..web/main` is empty).
- [ ] `CYPRESS_*` secrets exist on this repository.
- [ ] `BackendDeploy` ignores `apps/web/**`.
- [ ] Website contributors have write access and `codeowners/errors` is empty.
- [ ] Branch protection: 1 approval, code-owner review, bypass fellmirr.
- [ ] Deploy hook URLs and their callers are written down.

Per Vercel project after the cutover:

- [ ] Build log: root directory `apps/web`, `pnpm install --frozen-lockfile --filter main-site`,
      "Building Sanity to public/studio", `next build` succeeds.
- [ ] Production domain serves the new deployment; `/studio` loads; a donation widget loads
      and Min side login works.
- [ ] For `main-site` and `giv-effektivt`: `web-ci` runs Cypress against the deployment and
      it passes in Cypress Cloud.
- [ ] Each recreated deploy hook starts a production deployment, and a Sanity publish does too.
- [ ] `giv-effektivt`: `dev.giveffektivt.dk` updates from its new branch.
- [ ] A preview for a backend-only PR is skipped (ignored build step); production always builds.
- [ ] A website-only commit to `master` does not run BackendDeploy.
