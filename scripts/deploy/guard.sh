#!/usr/bin/env bash
# Deploy guard for the Cloud Build deploys (cloud.deploy.yaml, cloudbuild.admin.yaml).
#
# Every merge to main starts its own deploy, and Cloud Build runs them in parallel, so an older
# build can finish last and ship older code. This step checks that the build's commit is still
# the tip of main. If it isn't, it writes $SKIP_FILE and exits 0; every later step runs through
# unless-skipped.sh, which then exits 0 without doing anything, so the build succeeds without
# deploying and the newer build deploys instead. Run it as the first step and again right before
# the first step that changes production (migrations, deploys, publishing).
#
# Fails open: without a commit (a manual build) or when GitHub can't be reached, the deploy goes
# ahead as it would without the guard.
#
# Env: COMMIT_SHA (Cloud Build sets it for triggered builds), DEPLOY_GUARD_REPO and
# DEPLOY_GUARD_BRANCH (defaults below), DEPLOY_SKIP_FILE (default /workspace/.deploy-skip).
set -euo pipefail

repo="${DEPLOY_GUARD_REPO:-https://github.com/stiftelsen-effekt/effekt-platform.git}"
branch="${DEPLOY_GUARD_BRANCH:-main}"
skip_file="${DEPLOY_SKIP_FILE:-/workspace/.deploy-skip}"
commit="${COMMIT_SHA:-}"

if [[ -f "$skip_file" ]]; then
  echo "deploy-guard: already skipping: $(cat "$skip_file")"
  exit 0
fi

if [[ -z "$commit" ]]; then
  echo "deploy-guard: no COMMIT_SHA (manual build?), deploying"
  exit 0
fi

# The repository is public, so this needs no credentials
if ! tip="$(git ls-remote "$repo" "refs/heads/$branch" | cut -f1)" || [[ -z "$tip" ]]; then
  echo "deploy-guard: could not read the tip of $branch from $repo, deploying"
  exit 0
fi

if [[ "$tip" == "$commit" ]]; then
  echo "deploy-guard: $commit is the tip of $branch, deploying"
  exit 0
fi

echo "$commit is no longer the tip of $branch ($tip); the build for $tip deploys instead" \
  > "$skip_file"
echo "deploy-guard: skipping the rest of this build: $(cat "$skip_file")"
