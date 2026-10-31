#!/usr/bin/env bash
# Deploy guard for the Cloud Build deploys (cloud.deploy.yaml, cloudbuild.admin.yaml).
#
# Every merge to main starts its own deploy, and Cloud Build runs them in parallel, so an older
# build can finish last and ship older code. This step checks whether a newer commit on main
# starts its own build of the same trigger. If one does, it writes $SKIP_FILE and exits 0; every
# later step runs through unless-skipped.sh, which then exits 0 without doing anything, so the
# build succeeds without deploying and the newer build deploys instead. Run it as the first step
# and again right before the first step that changes production (migrations, deploys,
# publishing).
#
# A newer commit only starts a build of this trigger when it changes a file in the trigger's
# scope, so the guard skips only then. Otherwise this build is the newest one that deploys (an
# API merge followed by a website-only merge must still deploy the API). The scope mirrors the
# trigger's file filters and must be kept in sync with them (docs/deploy.md):
#
#   DEPLOY_GUARD_INCLUDE  space-separated globs; a commit is in scope if it changes a matching
#                         file (the trigger's includedFiles). Empty: every file matches.
#   DEPLOY_GUARD_IGNORE   space-separated globs; files matching these don't count (the
#                         trigger's ignoredFiles)
#
# `**` and `*` both match across directories, which is enough for the triggers' globs.
#
# Fails open: without a commit (a manual build), when GitHub can't be reached or when the commits
# between this build and the tip can't be read, the deploy goes ahead as it would without the
# guard.
#
# Env: COMMIT_SHA (Cloud Build sets it for triggered builds), DEPLOY_GUARD_REPO and
# DEPLOY_GUARD_BRANCH (defaults below), DEPLOY_SKIP_FILE (default /workspace/.deploy-skip),
# DEPLOY_GUARD_DEPTH (how many commits of main to fetch, default 200).
set -euo pipefail

repo="${DEPLOY_GUARD_REPO:-https://github.com/stiftelsen-effekt/effekt-platform.git}"
branch="${DEPLOY_GUARD_BRANCH:-main}"
skip_file="${DEPLOY_SKIP_FILE:-/workspace/.deploy-skip}"
commit="${COMMIT_SHA:-}"
read -r -a include <<<"${DEPLOY_GUARD_INCLUDE:-}"
read -r -a ignore <<<"${DEPLOY_GUARD_IGNORE:-}"
depth="${DEPLOY_GUARD_DEPTH:-200}"

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

matches() { # matches FILE GLOB...
  local file="$1" glob
  shift
  for glob in "$@"; do
    # shellcheck disable=SC2053 # the glob is meant to match as a pattern
    [[ "$file" == ${glob//\*\*/*} ]] && return 0
  done
  return 1
}

in_scope() { # in_scope FILE
  if ((${#ignore[@]})) && matches "$1" "${ignore[@]}"; then return 1; fi
  if ((${#include[@]})) && ! matches "$1" "${include[@]}"; then return 1; fi
  return 0
}

# History of main without file contents (commits and trees only), enough to list changed files
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
if ! git -C "$scratch" init -q \
  || ! git -C "$scratch" fetch -q --filter=blob:none --depth="$depth" "$repo" "$tip" \
  || ! git -C "$scratch" merge-base --is-ancestor "$commit" "$tip" 2>/dev/null; then
  echo "deploy-guard: could not read the commits between $commit and the tip $tip of $branch, deploying"
  exit 0
fi

# Newer commits that start a build of this trigger, newest first
newer=""
while read -r sha; do
  while IFS= read -r file; do
    if [[ -n "$file" ]] && in_scope "$file"; then
      newer="$sha"
      break 2
    fi
  done < <(git -C "$scratch" diff-tree --no-commit-id --name-only -r --root "$sha")
done < <(git -C "$scratch" rev-list "$commit..$tip")

if [[ -z "$newer" ]]; then
  echo "deploy-guard: $commit is not the tip of $branch ($tip), but no newer commit is in this" \
    "deploy's scope, deploying"
  exit 0
fi

echo "$commit is no longer the newest commit in this deploy's scope ($newer is); its build" \
  "deploys instead" > "$skip_file"
echo "deploy-guard: skipping the rest of this build: $(cat "$skip_file")"
