# Deploying

Merging to `main` deploys. Cloud Build (project `hidden-display-243419`) runs one build per
merge for each trigger whose files changed; Vercel builds the websites on its own.

| Trigger         | Config                  | What it does                                                                                                                                |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `BackendDeploy` | `cloud.deploy.yaml`     | Builds the API image as `effektapi:$BUILD_ID`, runs the Norwegian and Swedish migration jobs on it, deploys both Cloud Run services from it |
| `AdminDeploy`   | `cloudbuild.admin.yaml` | Typechecks, tests and builds `apps/admin`, publishes it to its bucket ([admin-deployment.md](admin-deployment.md))                          |

`QualityAssurance` (`cloud.qa.yaml`) is the PR check and deploys nothing.

## Only the newest commit deploys

Cloud Build runs the builds for consecutive merges in parallel, so an older build can finish
last and ship older code, or two builds deploy the same Cloud Run service at once and one fails
with `ABORTED: Conflict for resource … version … was specified but current version is …`.

Both deploy configs therefore start with a guard step, [`scripts/deploy/guard.sh`](../scripts/deploy/guard.sh),
which compares the build's `$COMMIT_SHA` with the tip of `main` (`git ls-remote` on the public
repository, no credentials). When a newer commit has landed, it writes `/workspace/.deploy-skip`
and exits 0. Every later step runs its command through
[`scripts/deploy/unless-skipped.sh`](../scripts/deploy/unless-skipped.sh), which exits 0 without
running it while that file exists, so the build ends green without deploying and the newer
commit's build deploys instead.

The guard runs twice: first, and again right before the first step that touches production
(`guard-before-release` before pushing `:latest` and migrating; `guard-before-publish` before the
admin upload), since a newer merge often lands during the image build. Migrations never run
in a skipped build.

The guard fails open: a build without `$COMMIT_SHA` (started by hand) or one that can't reach
GitHub deploys as before. A skipped build shows the reason in each step's log ("Skipped: …").
To redeploy an older commit on purpose, run the trigger by hand on that commit while it is the
tip, or revert on `main`.

## Deploy the image this build made

`cloud.deploy.yaml` tags the image `effektapi:$BUILD_ID` and pushes that tag before the second
guard. The migration jobs (`gcloud run jobs update … --image … --execute-now --wait`, which also
leaves the job pointing at that image) and both Cloud Run services use that tag, never
`:latest`: an older build running in parallel can push `:latest` after this one, and deploying
by the shared tag would then ship the older image. `:latest` is still pushed after
`guard-before-release`, as a convenience for pulling the current image by hand; nothing deploys
from it.

To check the step logic without Cloud Build, run each step's `entrypoint` and `args` locally with
`docker` and `gcloud` replaced by scripts that log their arguments, `DEPLOY_GUARD_REPO` pointed
at a local bare repository and `DEPLOY_SKIP_FILE` at a temporary path: with the commit at the tip
every step runs and every `--image` is `effektapi:$BUILD_ID`; with a new commit pushed to the
local repository during `docker build`, only the build and the `$BUILD_ID` push run.

What it does not cover: two builds that both pass the second check (a merge landing during the
last minutes of the older build's deploy) can still overlap. The newer build then deploys last.
